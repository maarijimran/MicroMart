import { BadRequestException, Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { z } from 'zod';
import { CatalogService } from './catalog.service';
import { RequireAdminGuard } from './jwt.guard';
import { MAX_PRODUCT_IMAGES, type UploadedImage, validateImages } from './product-images';
import {
  createCategorySchema,
  createProductSchema,
  listProductsQuerySchema,
  setStockSchema,
  updateProductSchema,
} from './catalog.schemas';

type FieldErrors = Record<string, string[]>;

@Controller()
export class CatalogController {
  constructor(private readonly catalog: CatalogService) {}

  @Post('categories')
  @UseGuards(RequireAdminGuard)
  createCategory(@Body() body: unknown) {
    return this.catalog.createCategory(parse(createCategorySchema, body));
  }

  @Get('categories')
  listCategories() {
    return this.catalog.listCategories();
  }

  /**
   * multipart/form-data: the product fields plus 1–5 `images` files. Fields and
   * images are validated together so the client gets every error at once.
   */
  @Post('products')
  @UseGuards(RequireAdminGuard)
  async createProduct(@Req() req: FastifyRequest) {
    const { fields, images } = await readProductForm(req);

    const fieldErrors: FieldErrors = {};
    const parsed = createProductSchema.safeParse(fields);
    if (!parsed.success) Object.assign(fieldErrors, z.flattenError(parsed.error).fieldErrors);
    const imageError = validateImages(images);
    if (imageError) fieldErrors.images = [imageError];

    if (!parsed.success || imageError) throw validationError(fieldErrors);
    return this.catalog.createProduct(parsed.data, images);
  }

  @Patch('products/:id')
  @UseGuards(RequireAdminGuard)
  updateProduct(@Param('id') id: string, @Body() body: unknown) {
    return this.catalog.updateProduct(id, parse(updateProductSchema, body));
  }

  @Post('products/:id/stock')
  @UseGuards(RequireAdminGuard)
  setStock(@Param('id') id: string, @Body() body: unknown) {
    return this.catalog.setStock(id, parse(setStockSchema, body));
  }

  @Get('products')
  listProducts(@Query() query: unknown) {
    return this.catalog.listProducts(parse(listProductsQuerySchema, query));
  }

  @Get('products/:id')
  getProduct(@Param('id') id: string) {
    return this.catalog.getProduct(id);
  }
}

async function readProductForm(req: FastifyRequest) {
  if (!req.isMultipart()) {
    throw validationError({ images: ['Add at least one product photo.'] });
  }

  const fields: Record<string, string> = {};
  const images: UploadedImage[] = [];
  try {
    for await (const part of req.parts()) {
      if (part.type === 'file') {
        const buffer = await part.toBuffer(); // always drain the stream, even for unexpected fields
        if (part.fieldname === 'images') images.push({ filename: part.filename, buffer });
      } else {
        fields[part.fieldname] = String(part.value);
      }
    }
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (code === 'FST_REQ_FILE_TOO_LARGE') throw validationError({ images: ['Each photo must be 5 MB or smaller.'] });
    if (code === 'FST_FILES_LIMIT') throw validationError({ images: [`You can upload up to ${MAX_PRODUCT_IMAGES} photos.`] });
    if (code === 'FST_PARTS_LIMIT' || code === 'FST_FIELDS_LIMIT') throw validationError({}, 'The form has too many fields.');
    throw new BadRequestException({ message: 'The upload could not be read. Please try again.' });
  }
  return { fields, images };
}

function validationError(fieldErrors: FieldErrors, message = 'Please fix the highlighted fields.') {
  return new BadRequestException({ message, errors: { formErrors: [], fieldErrors } });
}

function parse<T>(schema: z.ZodType<T>, body: unknown): T {
  const result = schema.safeParse(body);
  if (!result.success) {
    const { formErrors, fieldErrors } = z.flattenError(result.error);
    throw new BadRequestException({ message: 'Please fix the highlighted fields.', errors: { formErrors, fieldErrors } });
  }
  return result.data;
}
