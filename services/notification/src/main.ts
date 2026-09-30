import 'dotenv/config';
import './tracing';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { AppModule } from './app.module';

// No gRPC surface here — this service only consumes RabbitMQ events (via
// NotificationConsumer) and exposes one admin-only introspection route.
async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter());
  await app.listen({ port: Number(process.env.PORT ?? 3005), host: '0.0.0.0' });
}
void bootstrap();
