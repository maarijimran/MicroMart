import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { AuthController } from './auth.controller';
import { CatalogController } from './catalog.controller';
import { OrderController } from './order.controller';
import { PaymentController } from './payment.controller';
import { ProxyService } from './proxy.service';
import { RedisService } from './redis.service';
import { OrderClient } from './order.client';
import { PaymentClient } from './payment.client';

@Module({
  controllers: [HealthController, AuthController, CatalogController, OrderController, PaymentController],
  providers: [ProxyService, RedisService, OrderClient, PaymentClient],
})
export class AppModule {}
