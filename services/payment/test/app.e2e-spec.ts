import { Test } from '@nestjs/testing';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import request from 'supertest';
import { jest } from '@jest/globals';
import * as jwt from 'jsonwebtoken';
import { PaymentController } from '../src/payment.controller';
import { PaymentService } from '../src/payment.service';

const JWT_SECRET = 'e2e-test-secret';

describe('Payment HTTP API', () => {
  let app: NestFastifyApplication;
  let customerToken: string;
  let adminToken: string;

  beforeAll(() => {
    process.env.JWT_SECRET = JWT_SECRET;
    customerToken = jwt.sign({ email: 'ada@example.com', role: 'customer' }, JWT_SECRET, { subject: 'user-1' });
    adminToken = jwt.sign({ email: 'admin@example.com', role: 'admin' }, JWT_SECRET, { subject: 'admin-1' });
  });

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      controllers: [PaymentController],
      providers: [{
        provide: PaymentService,
        useValue: {
          seedWallet: jest.fn().mockResolvedValue({ userId: 'user-1', balance: 100, currency: 'USD' }),
          getWallet: jest.fn().mockResolvedValue({ userId: 'user-1', balance: 100, currency: 'USD' }),
          listPayments: jest.fn().mockResolvedValue({ payments: [], total: 0, page: 1, pageSize: 20 }),
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

  it('rejects any request with no Bearer token', async () => {
    await request(app.getHttpServer()).get('/wallets/me').expect(401);
  });

  it('rejects wallet seeding from a non-admin account', async () => {
    await request(app.getHttpServer())
      .post('/wallets/user-1/seed')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ balance: 100 })
      .expect(403);
  });

  it('allows an admin to seed a wallet', async () => {
    await request(app.getHttpServer())
      .post('/wallets/user-1/seed')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ balance: 100 })
      .expect(201)
      .expect(({ body }) => expect(body.balance).toBe(100));
  });

  it("returns the caller's own wallet", async () => {
    await request(app.getHttpServer())
      .get('/wallets/me')
      .set('Authorization', `Bearer ${customerToken}`)
      .expect(200)
      .expect(({ body }) => expect(body.userId).toBe('user-1'));
  });

  it('rejects a malformed seed amount', async () => {
    await request(app.getHttpServer())
      .post('/wallets/user-1/seed')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ balance: -5 })
      .expect(400);
  });
});
