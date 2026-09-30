import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { Transport } from '@nestjs/microservices';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { join } from 'node:path';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter());
  app.connectMicroservice({
    transport: Transport.GRPC,
    options: { package: 'micromart.order', protoPath: join(process.cwd(), '..', '..', 'proto', 'order.proto'), url: process.env.GRPC_URL ?? '0.0.0.0:50053' },
  });
  await app.startAllMicroservices();
  await app.listen({ port: Number(process.env.PORT ?? 3003), host: '0.0.0.0' });
}
void bootstrap();
