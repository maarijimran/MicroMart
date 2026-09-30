import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import { join } from 'node:path';

export interface CatalogProduct { id: string; name: string; price: number; currency: string; isActive: boolean; quantityAvailable: number; }
type CatalogGrpcClient = grpc.Client & { GetProduct(request: { productId: string }, callback: (error: grpc.ServiceError | null, response: CatalogProduct & { found: boolean }) => void): void };

@Injectable()
export class CatalogClient implements OnModuleInit, OnModuleDestroy {
  private client!: CatalogGrpcClient;

  onModuleInit() {
    const definition = protoLoader.loadSync(join(process.cwd(), '..', '..', 'proto', 'catalog.proto'), {
      keepCase: false, longs: String, enums: String, defaults: true, oneofs: true,
    });
    const descriptor = grpc.loadPackageDefinition(definition) as unknown as { micromart: { catalog: { CatalogService: typeof grpc.Client } } };
    this.client = new descriptor.micromart.catalog.CatalogService(
      process.env.CATALOG_GRPC_URL ?? 'localhost:50052', grpc.credentials.createInsecure(),
    ) as CatalogGrpcClient;
  }

  onModuleDestroy() { this.client?.close(); }

  getProduct(productId: string): Promise<CatalogProduct | null> {
    return new Promise((resolve, reject) => this.client.GetProduct({ productId }, (error, response) => {
      if (error) return reject(error);
      resolve(response.found ? response : null);
    }));
  }
}
