import { ConflictException, Injectable, Logger, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PrismaService } from './prisma.service';
import { RedisService } from './redis.service';
import { ElasticsearchService, ProductDocument } from './elasticsearch.service';
import { RabbitMqService } from './rabbitmq.service';
import { StorageService } from './storage.service';
import { detectImageType, type UploadedImage } from './product-images';
import {
  CreateCategoryInput,
  CreateProductInput,
  ListProductsQuery,
  SetStockInput,
  UpdateProductInput,
} from './catalog.schemas';

export interface OrderItem {
  productId: string;
  quantity: number;
}

const PRODUCT_CACHE_TTL = Number(process.env.PRODUCT_CACHE_TTL_SECONDS ?? 60);

const PRODUCT_INCLUDE = {
  category: true,
  inventory: true,
  images: { orderBy: { position: 'asc' as const } },
};

/** Same body shape as validation errors, so the client can show it on the field. */
function fieldConflict(field: string, message: string) {
  return new ConflictException({ message, errors: { formErrors: [], fieldErrors: { [field]: [message] } } });
}

@Injectable()
export class CatalogService {
  private readonly logger = new Logger(CatalogService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly search: ElasticsearchService,
    private readonly rabbitmq: RabbitMqService,
    private readonly storage: StorageService,
  ) { }

  // ---------------------------------------------------------------------
  // Categories
  // ---------------------------------------------------------------------

  async createCategory(input: CreateCategoryInput) {
    const existing = await this.prisma.category.findUnique({ where: { slug: input.slug } });
    if (existing) throw fieldConflict('slug', 'A category with this slug already exists.');
    return this.prisma.category.create({ data: input });
  }

  listCategories() {
    return this.prisma.category.findMany({ orderBy: { name: 'asc' } });
  }

  // ---------------------------------------------------------------------
  // Products (admin writes)
  // ---------------------------------------------------------------------

  async createProduct(input: CreateProductInput, images: UploadedImage[]) {
    const [skuTaken, slugTaken] = await Promise.all([
      this.prisma.product.findUnique({ where: { sku: input.sku } }),
      this.prisma.product.findUnique({ where: { slug: input.slug } }),
    ]);
    if (skuTaken) throw fieldConflict('sku', 'A product with this SKU already exists.');
    if (slugTaken) throw fieldConflict('slug', 'A product with this slug already exists.');
    const category = await this.prisma.category.findUnique({ where: { id: input.categoryId } });
    if (!category) throw fieldConflict('categoryId', 'This category no longer exists.');

    // Upload first, then write the product and its image rows. If the write
    // fails, delete what was uploaded so no orphaned objects are left behind.
    const productId = randomUUID();
    const uploads = await Promise.allSettled(
      images.map(async (image, position) => {
        const type = detectImageType(image.buffer)!; // validated by the controller
        const key = `products/${productId}/${randomUUID()}.${type.extension}`;
        await this.storage.put(key, image.buffer, type.contentType);
        return { key, position };
      }),
    );
    const uploaded = uploads.flatMap((result) => (result.status === 'fulfilled' ? [result.value] : []));
    const failedUpload = uploads.find((result) => result.status === 'rejected');
    if (failedUpload) {
      await this.storage.deleteMany(uploaded.map((image) => image.key));
      this.logger.error(`Image upload failed: ${(failedUpload.reason as Error).message}`);
      throw new ServiceUnavailableException('We couldn’t save the product photos. Please try again.');
    }

    let product;
    try {
      product = await this.prisma.product.create({
        data: {
          id: productId,
          categoryId: input.categoryId,
          sku: input.sku,
          name: input.name,
          slug: input.slug,
          description: input.description,
          price: input.price,
          currency: input.currency,
          inventory: { create: { quantityAvailable: input.initialQuantity } },
          images: { create: uploaded },
        },
        include: PRODUCT_INCLUDE,
      });
    } catch (error) {
      await this.storage.deleteMany(uploaded.map((image) => image.key));
      throw error;
    }

    await this.syncToIndex(product);
    return this.toPublicProduct(product);
  }

  async updateProduct(productId: string, input: UpdateProductInput) {
    const product = await this.prisma.product.update({
      where: { id: productId },
      data: input,
      include: PRODUCT_INCLUDE,
    });
    await this.redis.del(this.productCacheKey(productId));
    await this.syncToIndex(product);
    return this.toPublicProduct(product);
  }

  async setStock(productId: string, input: SetStockInput) {
    await this.prisma.inventory.update({
      where: { productId },
      data: { quantityAvailable: input.quantityAvailable },
    });
    await this.redis.del(this.productCacheKey(productId));
    return this.getProduct(productId);
  }

  // ---------------------------------------------------------------------
  // Products (public reads)
  // ---------------------------------------------------------------------

  async getProduct(productId: string) {
    const cached = await this.redis.getJSON<ReturnType<CatalogService['toPublicProduct']>>(
      this.productCacheKey(productId),
    );
    if (cached) return cached;

    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      include: PRODUCT_INCLUDE,
    });
    if (!product) throw new NotFoundException('Product not found.');

    const publicProduct = this.toPublicProduct(product);
    await this.redis.setJSON(this.productCacheKey(productId), publicProduct, PRODUCT_CACHE_TTL);
    return publicProduct;
  }

  async listProducts(query: ListProductsQuery) {
    return this.search.search({
      q: query.q,
      categoryId: query.categoryId,
      minPrice: query.minPrice,
      maxPrice: query.maxPrice,
      sort: query.sort,
      page: query.page,
      pageSize: query.pageSize,
    }).then((result) => ({
      ...result,
      results: result.results.map(({ imageKey, ...doc }) => ({
        ...doc,
        imageUrl: imageKey ? this.storage.publicUrl(imageKey) : null,
      })),
    }));
  }

  async checkAvailability(productId: string, quantity: number) {
    const inventory = await this.prisma.inventory.findUnique({ where: { productId } });
    return { available: !!inventory && inventory.quantityAvailable >= quantity, quantityAvailable: inventory?.quantityAvailable ?? 0 };
  }

  // ---------------------------------------------------------------------
  // Saga: stock reservation (consumes order.created, publishes stock.reserved
  // or stock.reservation_failed)
  // ---------------------------------------------------------------------

  async reserveStockForOrder(
    orderId: string,
    userId: string,
    totalAmount: number,
    currency: string,
    items: OrderItem[],
  ) {
    const alreadyReserved = await this.prisma.inventoryReservation.findFirst({ where: { orderId } });
    if (alreadyReserved) {
      this.logger.log(`Order ${orderId} already has reservations — skipping (idempotent).`);
      return;
    }

    const succeeded: OrderItem[] = [];
    let failure: { productId: string; quantity: number; reason: string } | undefined;

    for (const item of items) {
      // A single conditional UPDATE is atomic in Postgres: it only matches (and
      // only decrements) if enough stock is available right now, so concurrent
      // reservations on the same product can never oversell it.
      const result = await this.prisma.inventory.updateMany({
        where: { productId: item.productId, quantityAvailable: { gte: item.quantity } },
        data: {
          quantityAvailable: { decrement: item.quantity },
          quantityReserved: { increment: item.quantity },
        },
      });

      if (result.count === 0) {
        failure = { productId: item.productId, quantity: item.quantity, reason: 'insufficient_stock' };
        break;
      }

      await this.prisma.inventoryReservation.create({
        data: { orderId, productId: item.productId, quantity: item.quantity, status: 'pending' },
      });
      succeeded.push(item);
    }

    if (failure) {
      // Compensate any reservations already made for this same order before
      // reporting failure — the order as a whole either reserves or it doesn't.
      for (const item of succeeded) {
        await this.releaseOne(orderId, item.productId);
      }
      this.rabbitmq.publish('stock.reservation_failed', { orderId, userId, item: failure });
      return;
    }

    this.rabbitmq.publish('stock.reserved', { orderId, userId, totalAmount, currency, items });
  }

  // ---------------------------------------------------------------------
  // Saga compensation (consumes order.cancelled / order.payment_failed)
  // ---------------------------------------------------------------------

  async releaseReservationsForOrder(orderId: string) {
    const reservations = await this.prisma.inventoryReservation.findMany({
      where: { orderId, status: 'pending' },
    });
    if (reservations.length === 0) {
      this.logger.log(`No pending reservations for order ${orderId} — nothing to release (idempotent).`);
      return;
    }
    for (const reservation of reservations) {
      await this.releaseOne(orderId, reservation.productId);
    }
  }

  private async releaseOne(orderId: string, productId: string) {
    const reservation = await this.prisma.inventoryReservation.findUnique({
      where: { orderId_productId: { orderId, productId } },
    });
    if (!reservation || reservation.status !== 'pending') return;

    await this.prisma.$transaction([
      this.prisma.inventory.update({
        where: { productId },
        data: {
          quantityAvailable: { increment: reservation.quantity },
          quantityReserved: { decrement: reservation.quantity },
        },
      }),
      this.prisma.inventoryReservation.update({
        where: { id: reservation.id },
        data: { status: 'released' },
      }),
    ]);
  }

  // ---------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------

  private async syncToIndex(product: {
    id: string;
    name: string;
    description: string | null;
    price: { toString(): string };
    isActive: boolean;
    category: { id: string; name: string };
    images: { key: string }[];
  }) {
    const document: ProductDocument = {
      productId: product.id,
      name: product.name,
      description: product.description,
      categoryId: product.category.id,
      categoryName: product.category.name,
      price: Number(product.price.toString()),
      isActive: product.isActive,
      imageKey: product.images[0]?.key ?? null,
    };
    await this.search.indexProduct(product.id, document);
  }

  private toPublicProduct(product: {
    id: string;
    sku: string;
    name: string;
    slug: string;
    description: string | null;
    price: { toString(): string };
    currency: string;
    isActive: boolean;
    category: { id: string; name: string; slug: string };
    inventory: { quantityAvailable: number; quantityReserved: number } | null;
    images: { id: string; key: string; position: number }[];
  }) {
    return {
      id: product.id,
      sku: product.sku,
      name: product.name,
      slug: product.slug,
      description: product.description,
      price: Number(product.price.toString()),
      currency: product.currency,
      isActive: product.isActive,
      category: { id: product.category.id, name: product.category.name, slug: product.category.slug },
      quantityAvailable: product.inventory?.quantityAvailable ?? 0,
      quantityReserved: product.inventory?.quantityReserved ?? 0,
      images: product.images.map((image) => ({ id: image.id, url: this.storage.publicUrl(image.key), position: image.position })),
    };
  }

  private productCacheKey(productId: string) {
    return `product:${productId}`;
  }
}
