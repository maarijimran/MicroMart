import { Test } from '@nestjs/testing';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import request from 'supertest';
import { jest } from '@jest/globals';
import * as jwt from 'jsonwebtoken';
import { OrderController } from '../src/order.controller';
import { OrderService } from '../src/order.service';

const JWT_SECRET = 'e2e-test-secret';

describe('Order HTTP API', () => {
  let app: NestFastifyApplication;
  let accessToken: string;

  beforeAll(() => {
    process.env.JWT_SECRET = JWT_SECRET;
    accessToken = jwt.sign({ email: 'ada@example.com', role: 'customer' }, JWT_SECRET, { subject: 'user-1' });
  });

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      controllers: [OrderController],
      providers: [{
        provide: OrderService,
        useValue: {
          createOrder: jest.fn().mockResolvedValue({ id: 'order-1', status: 'pending' }),
          listOrders: jest.fn().mockResolvedValue({ orders: [], total: 0, page: 1, pageSize: 20 }),
          getOrder: jest.fn().mockResolvedValue({ id: 'order-1', status: 'pending' }),
        },
      }],
    }).compile();
    app = module.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterEach(async () => {
    await app?.close();
  });

  it('rejects checkout with no Bearer token', async () => {
    await request(app.getHttpServer())
      .post('/orders')
      .send({ items: [{ productId: '8ffecdc1-6cc9-4d2f-8b39-8bb5b7ec1d2f', quantity: 1 }] })
      .expect(401);
  });

  it('rejects a checkout payload with no items', async () => {
    await request(app.getHttpServer())
      .post('/orders')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ items: [] })
      .expect(400);
  });

  it('creates an order for an authenticated user', async () => {
    await request(app.getHttpServer())
      .post('/orders')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ items: [{ productId: '8ffecdc1-6cc9-4d2f-8b39-8bb5b7ec1d2f', quantity: 1 }] })
      .expect(201)
      .expect(({ body }) => expect(body.id).toBe('order-1'));
  });

  it('lists the caller\'s orders', async () => {
    await request(app.getHttpServer())
      .get('/orders')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200)
      .expect(({ body }) => expect(body.total).toBe(0));
  });
});
