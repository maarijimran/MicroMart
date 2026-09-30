import 'dotenv/config';
import './tracing';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import cors from '@fastify/cors';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter());
  // Multipart bodies (product photo uploads) are not parsed here — the raw
  // stream is handed to the route untouched and piped to Catalog, which owns
  // the real validation. See CatalogController.createProduct.
  app
    .getHttpAdapter()
    .getInstance()
    .addContentTypeParser('multipart/form-data', (_request, payload, done) => done(null, payload));
  await app.register(cors as any, {
    origin: process.env.CORS_ORIGIN ?? 'http://localhost:5173',
    credentials: true,
  });
  await app.listen({ port: Number(process.env.PORT ?? 3000), host: '0.0.0.0' });
}
void bootstrap();
