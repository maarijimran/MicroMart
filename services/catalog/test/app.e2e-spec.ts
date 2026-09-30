import { Test } from '@nestjs/testing';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { jest } from '@jest/globals';
import request from 'supertest';
import { CatalogController } from '../src/catalog.controller';
import { CatalogService } from '../src/catalog.service';

describe('Catalog HTTP API', () => {
  let app: NestFastifyApplication;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      controllers: [CatalogController],
      providers: [{
        provide: CatalogService,
        useValue: {
          listCategories: jest.fn().mockResolvedValue([{ id: 'cat-1', name: 'Widgets', slug: 'widgets' }]),
          listProducts: jest.fn().mockResolvedValue({ total: 0, page: 1, pageSize: 20, results: [] }),
          getProduct: jest.fn().mockResolvedValue({ id: 'prod-1', name: 'Widget', quantityAvailable: 5 }),
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

  it('lists categories without requiring auth', async () => {
    await request(app.getHttpServer())
      .get('/categories')
      .expect(200)
      .expect(({ body }) => expect(body[0].slug).toBe('widgets'));
  });

  it('rejects an admin-only route with no Bearer token', async () => {
    await request(app.getHttpServer())
      .post('/categories')
      .send({ name: 'Widgets', slug: 'widgets' })
      .expect(401);
  });

  it('rejects a malformed product search query', async () => {
    await request(app.getHttpServer())
      .get('/products')
      .query({ pageSize: 999 })
      .expect(400);
  });

  it('returns a single product by id', async () => {
    await request(app.getHttpServer())
      .get('/products/prod-1')
      .expect(200)
      .expect(({ body }) => expect(body.quantityAvailable).toBe(5));
  });
});
