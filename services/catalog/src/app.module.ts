import { Module } from '@nestjs/common';
import { CatalogController } from './catalog.controller';
import { CatalogGrpcController } from './catalog.grpc.controller';
import { CatalogConsumer } from './catalog.consumer';
import { CatalogService } from './catalog.service';
import { ElasticsearchService } from './elasticsearch.service';
import { PrismaService } from './prisma.service';
import { RabbitMqService } from './rabbitmq.service';
import { RedisService } from './redis.service';
import { StorageService } from './storage.service';

@Module({
  controllers: [CatalogController, CatalogGrpcController],
  providers: [
    CatalogService,
    PrismaService,
    RedisService,
    ElasticsearchService,
    RabbitMqService,
    StorageService,
    CatalogConsumer,
  ],
})
export class AppModule {}
