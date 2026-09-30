import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { Transport } from '@nestjs/microservices';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import multipart from '@fastify/multipart';
import { join } from 'node:path';
import { AppModule } from './app.module';
import { MAX_IMAGE_BYTES, MAX_PRODUCT_IMAGES } from './product-images';

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter(),
  );
  // Product creation is multipart (fields + 1–5 photos). The limits here are
  // the hard stop; per-file type and count checks live in product-images.ts.
  await app.register(multipart as any, {
    limits: { files: MAX_PRODUCT_IMAGES, fileSize: MAX_IMAGE_BYTES, fields: 20, fieldSize: 64 * 1024, parts: 30 },
    throwFileSizeLimit: true,
  });
  app.connectMicroservice({
    transport: Transport.GRPC,
    options: {
      package: 'micromart.catalog',
      protoPath: join(process.cwd(), '..', '..', 'proto', 'catalog.proto'),
      url: process.env.GRPC_URL ?? '0.0.0.0:50052',
    },
  });
  await app.startAllMicroservices();
  await app.listen({ port: Number(process.env.PORT ?? 3002), host: '0.0.0.0' });
}

void bootstrap();
