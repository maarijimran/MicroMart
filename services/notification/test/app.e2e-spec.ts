import { Test } from '@nestjs/testing';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import request from 'supertest';
import { jest } from '@jest/globals';
import * as jwt from 'jsonwebtoken';
import { NotificationController } from '../src/notification.controller';
import { NotificationService } from '../src/notification.service';

const JWT_SECRET = 'e2e-test-secret';

describe('Notification HTTP API', () => {
  let app: NestFastifyApplication;
  let adminToken: string;
  let customerToken: string;

  beforeAll(() => {
    process.env.JWT_SECRET = JWT_SECRET;
    adminToken = jwt.sign({ email: 'admin@example.com', role: 'admin' }, JWT_SECRET, { subject: 'admin-1' });
    customerToken = jwt.sign({ email: 'ada@example.com', role: 'customer' }, JWT_SECRET, { subject: 'user-1' });
  });

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      controllers: [NotificationController],
      providers: [{
        provide: NotificationService,
        useValue: {
          listNotifications: jest.fn().mockResolvedValue({ notifications: [], total: 0, page: 1, pageSize: 20 }),
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

  it('rejects the introspection route with no Bearer token', async () => {
    await request(app.getHttpServer()).get('/notifications').expect(401);
  });

  it('rejects a non-admin account', async () => {
    await request(app.getHttpServer())
      .get('/notifications')
      .set('Authorization', `Bearer ${customerToken}`)
      .expect(403);
  });

  it('lets an admin list logged notifications', async () => {
    await request(app.getHttpServer())
      .get('/notifications')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200)
      .expect(({ body }) => expect(body.total).toBe(0));
  });
});
