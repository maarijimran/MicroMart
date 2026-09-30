import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Client } from '@elastic/elasticsearch';

export interface ProductDocument {
  productId: string;
  name: string;
  description: string | null;
  categoryId: string;
  categoryName: string;
  price: number;
  isActive: boolean;
  /** Object key of the product's first image (the listing thumbnail). */
  imageKey: string | null;
}

export interface ProductSearchParams {
  q?: string;
  categoryId?: string;
  minPrice?: number;
  maxPrice?: number;
  sort: 'relevance' | 'price_asc' | 'price_desc';
  page: number;
  pageSize: number;
}

const INDEX = 'products';

@Injectable()
export class ElasticsearchService implements OnModuleInit {
  private readonly logger = new Logger(ElasticsearchService.name);
  private readonly client: Client;

  constructor() {
    this.client = new Client({ node: process.env.ELASTICSEARCH_URL ?? 'http://localhost:9200' });
  }

  async onModuleInit() {
    try {
      const exists = await this.client.indices.exists({ index: INDEX });
      if (!exists) {
        await this.client.indices.create({
          index: INDEX,
          mappings: {
            properties: {
              productId: { type: 'keyword' },
              name: { type: 'text' },
              description: { type: 'text' },
              categoryId: { type: 'keyword' },
              categoryName: { type: 'keyword' },
              price: { type: 'float' },
              isActive: { type: 'boolean' },
              imageKey: { type: 'keyword', index: false },
            },
          },
        });
      } else {
        // Additive mapping change, safe on an existing index — no reindex needed.
        await this.client.indices.putMapping({ index: INDEX, properties: { imageKey: { type: 'keyword', index: false } } });
      }
    } catch (error) {
      // Don't crash the service if Elasticsearch isn't up yet — search will
      // simply return empty results until it's reachable and re-synced.
      this.logger.warn(`Elasticsearch index setup failed: ${(error as Error).message}`);
    }
  }

  async indexProduct(id: string, document: ProductDocument) {
    try {
      await this.client.index({ index: INDEX, id, document, refresh: 'wait_for' });
    } catch (error) {
      this.logger.warn(`Failed to index product ${id}: ${(error as Error).message}`);
    }
  }

  async deleteProduct(id: string) {
    try {
      await this.client.delete({ index: INDEX, id }, { ignore: [404] });
    } catch (error) {
      this.logger.warn(`Failed to delete product ${id} from index: ${(error as Error).message}`);
    }
  }

  async search(params: ProductSearchParams) {
    const filter: Record<string, unknown>[] = [{ term: { isActive: true } }];
    if (params.categoryId) filter.push({ term: { categoryId: params.categoryId } });
    if (params.minPrice !== undefined || params.maxPrice !== undefined) {
      filter.push({
        range: {
          price: {
            ...(params.minPrice !== undefined ? { gte: params.minPrice } : {}),
            ...(params.maxPrice !== undefined ? { lte: params.maxPrice } : {}),
          },
        },
      });
    }

    const result = await this.client.search<ProductDocument>({
      index: INDEX,
      from: (params.page - 1) * params.pageSize,
      size: params.pageSize,
      sort:
        params.sort === 'price_asc'
          ? [{ price: 'asc' }, '_score']
          : params.sort === 'price_desc'
            ? [{ price: 'desc' }, '_score']
            : ['_score', { price: 'asc' }],
      track_scores: true,
      query: {
        bool: {
          must: params.q ? [{ multi_match: { query: params.q, fields: ['name^2', 'description'] } }] : [{ match_all: {} }],
          filter,
        },
      },
    });

    const total = typeof result.hits.total === 'number' ? result.hits.total : (result.hits.total?.value ?? 0);
    return {
      total,
      page: params.page,
      pageSize: params.pageSize,
      results: result.hits.hits.map((hit) => hit._source).filter((doc): doc is ProductDocument => !!doc),
    };
  }
}
