import { Module } from '@nestjs/common';
import { NotificationController } from './notification.controller';
import { NotificationConsumer } from './notification.consumer';
import { NotificationService } from './notification.service';
import { PrismaService } from './prisma.service';
import { RabbitMqService } from './rabbitmq.service';
import { RedisService } from './redis.service';

@Module({
  controllers: [NotificationController],
  providers: [NotificationService, PrismaService, RedisService, RabbitMqService, NotificationConsumer],
})
export class AppModule {}
