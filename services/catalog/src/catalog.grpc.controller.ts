import { Controller } from '@nestjs/common';
import { GrpcMethod } from '@nestjs/microservices';
import { CatalogService } from './catalog.service';

@Controller()
export class CatalogGrpcController {
  constructor(private readonly catalog: CatalogService) {}

  @GrpcMethod('CatalogService', 'CheckAvailability')
  async checkAvailability(request: { productId?: string; product_id?: string; quantity: number }) {
    return this.catalog.checkAvailability(request.productId ?? request.product_id ?? '', request.quantity);
  }

  @GrpcMethod('CatalogService', 'GetProduct')
  async getProduct(request: { productId?: string; product_id?: string }) {
    try {
      const product = await this.catalog.getProduct(request.productId ?? request.product_id ?? '');
      return { found: true, ...product };
    } catch {
      return { found: false };
    }
  }
}
