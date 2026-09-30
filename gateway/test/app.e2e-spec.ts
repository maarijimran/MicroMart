import { Test } from '@nestjs/testing';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import request from 'supertest';
import { jest } from '@jest/globals';
import * as jwt from 'jsonwebtoken';
import { HealthController } from '../src/health.controller';
import { OrderController } from '../src/order.controller';
import { OrderClient } from '../src/order.client';
import { RedisService } from '../src/redis.service';

const JWT_SECRET = 'e2e-test-secret';

describe('Gateway HTTP API', () => {
  let app: NestFastifyApplication;
  let accessToken: string;

  beforeAll(() => {
    process.env.JWT_SECRET = JWT_SECRET;
    accessToken = jwt.sign({ email: 'ada@example.com', role: 'customer' }, JWT_SECRET, { subject: 'user-1' });
  });

  describe('/health', () => {
    beforeEach(async () => {
      const module = await Test.createTestingModule({ controllers: [HealthController] }).compile();
      app = module.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
      await app.init();
      await app.getHttpAdapter().getInstance().ready();
    });
    afterEach(async () => app?.close());

    it('responds ok with no auth required', async () => {
      await request(app.getHttpServer()).get('/health').expect(200).expect(({ body }) => expect(body.status).toBe('ok'));
    });
  });

  describe('/orders', () => {
    beforeEach(async () => {
      const module = await Test.createTestingModule({
        controllers: [OrderController],
        providers: [
          { provide: OrderClient, useValue: { createOrder: jest.fn().mockResolvedValue({ id: 'order-1', status: 'pending' }) } },
          { provide: RedisService, useValue: { incrementWithExpiry: jest.fn().mockResolvedValue(1) } },
        ],
      }).compile();
      app = module.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
      await app.init();
      await app.getHttpAdapter().getInstance().ready();
    });
    afterEach(async () => app?.close());

    it('rejects checkout with no Bearer token', async () => {
      await request(app.getHttpServer())
        .post('/orders')
        .send({ items: [{ productId: '8ffecdc1-6cc9-4d2f-8b39-8bb5b7ec1d2f', quantity: 1 }] })
        .expect(401);
    });

    it('rejects an empty cart even when authenticated', async () => {
      await request(app.getHttpServer())
        .post('/orders')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ items: [] })
        .expect(400);
    });

    it('translates a valid checkout into an OrderClient.createOrder gRPC call', async () => {
      await request(app.getHttpServer())
        .post('/orders')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ items: [{ productId: '8ffecdc1-6cc9-4d2f-8b39-8bb5b7ec1d2f', quantity: 1 }] })
        .expect(201)
        .expect(({ body }) => expect(body.id).toBe('order-1'));
    });
  });
});
