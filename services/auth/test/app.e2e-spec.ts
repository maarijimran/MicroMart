import { Test } from '@nestjs/testing';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { jest } from '@jest/globals';
import request from 'supertest';
import { AuthController } from '../src/auth.controller';
import { AuthService } from '../src/auth.service';

describe('Auth HTTP API', () => {
  let app: NestFastifyApplication;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [{
        provide: AuthService,
        useValue: {
          register: jest.fn().mockResolvedValue({ id: 'user-1', email: 'ada@example.com', role: 'customer' }),
          login: jest.fn().mockResolvedValue({ accessToken: 'access', refreshToken: 'refresh' }),
          refresh: jest.fn().mockResolvedValue({ accessToken: 'new-access', refreshToken: 'new-refresh' }),
          logout: jest.fn().mockResolvedValue(undefined),
          verifyAccessToken: jest.fn().mockResolvedValue({ valid: true, user: { id: 'user-1', email: 'ada@example.com', role: 'customer' } }),
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

  it('registers a valid user', async () => {
    await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email: 'ADA@EXAMPLE.COM', password: 'StrongPass1!' })
      .expect(201)
      .expect(({ body }) => expect(body.user.email).toBe('ada@example.com'));
  });

  it('rejects a weak password before calling the service', async () => {
    await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email: 'ada@example.com', password: 'weak' })
      .expect(400);
  });

  it('returns the current user for a Bearer token', async () => {
    await request(app.getHttpServer())
      .get('/auth/me')
      .set('Authorization', 'Bearer access')
      .expect(200)
      .expect(({ body }) => expect(body.user.id).toBe('user-1'));
  });
});
