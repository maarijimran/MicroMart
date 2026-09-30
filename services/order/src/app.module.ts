import { Module } from '@nestjs/common';
import { CatalogClient } from './catalog.client';
import { OrderConsumer } from './order.consumer';
import { OrderController } from './order.controller';
import { OrderGrpcController } from './order.grpc.controller';
import { OrderService } from './order.service';
import { PrismaService } from './prisma.service';
import { RabbitMqService } from './rabbitmq.service';
import { RedisService } from './redis.service';

@Module({
  controllers: [OrderController, OrderGrpcController],
  providers: [OrderService, OrderConsumer, PrismaService, RedisService, RabbitMqService, CatalogClient],
})
export class AppModule {}
