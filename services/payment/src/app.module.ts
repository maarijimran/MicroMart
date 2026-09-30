import { Module } from '@nestjs/common';
import { PaymentController } from './payment.controller';
import { PaymentGrpcController } from './payment.grpc.controller';
import { PaymentConsumer } from './payment.consumer';
import { PaymentService } from './payment.service';
import { PrismaService } from './prisma.service';
import { RabbitMqService } from './rabbitmq.service';
import { RedisService } from './redis.service';

@Module({
  controllers: [PaymentController, PaymentGrpcController],
  providers: [PaymentService, PrismaService, RedisService, RabbitMqService, PaymentConsumer],
})
export class AppModule {}
