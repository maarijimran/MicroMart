import { Body, Controller, Get, Headers, Param, Patch, Post, Query, Req, Res, UseGuards } from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { RequireAdminGuard } from './jwt.guard';
import { GlobalRateLimitGuard } from './rate-limit.guard';
import { ProxyService } from './proxy.service';

const CATALOG_URL = () => process.env.CATALOG_URL ?? 'http://localhost:3002';

// 5 photos × 5 MB, plus headroom for the text fields and multipart framing.
const MAX_PRODUCT_UPLOAD_BYTES = 5 * 5 * 1024 * 1024 + 1024 * 1024;

/**
 * Catalog's own REST API already fully implements browsing, search, and
 * admin CRUD — proxied straight through rather than reimplemented here.
 * Admin routes are protected at BOTH layers on purpose: the gateway's guard
 * rejects early for a fast, cheap no, but Catalog re-checks the token
 * itself too — a service should never trust "the gateway already checked"
 * as its only line of defense.
 */
@Controller()
@UseGuards(GlobalRateLimitGuard)
export class CatalogController {
  constructor(private readonly proxy: ProxyService) {}

  @Get('categories')
  async listCategories(@Res() reply: FastifyReply) {
    const result = await this.proxy.forward('GET', `${CATALOG_URL()}/categories`);
    reply.status(result.status).send(result.body);
  }

  @Post('categories')
  @UseGuards(RequireAdminGuard)
  async createCategory(@Body() body: unknown, @Headers('authorization') authorization: string, @Res() reply: FastifyReply) {
    const result = await this.proxy.forward('POST', `${CATALOG_URL()}/categories`, { body, authorization });
    reply.status(result.status).send(result.body);
  }

  @Get('products')
  async listProducts(@Query() query: Record<string, string>, @Res() reply: FastifyReply) {
    const qs = new URLSearchParams(query).toString();
    const result = await this.proxy.forward('GET', `${CATALOG_URL()}/products${qs ? `?${qs}` : ''}`);
    reply.status(result.status).send(result.body);
  }

  /**
   * multipart/form-data (fields + 1–5 photos), streamed to Catalog as-is.
   * Only a cheap size/shape check happens here; Catalog validates every field
   * and file and returns field-level errors.
   */
  @Post('products')
  @UseGuards(RequireAdminGuard)
  async createProduct(@Req() req: FastifyRequest, @Headers('authorization') authorization: string, @Res() reply: FastifyReply) {
    const contentType = req.headers['content-type'] ?? '';
    const contentLength = req.headers['content-length'];
    if (!contentType.startsWith('multipart/form-data')) {
      return reply.status(400).send({
        message: 'Please fix the highlighted fields.',
        errors: { formErrors: [], fieldErrors: { images: ['Add at least one product photo.'] } },
      });
    }
    if (!contentLength) {
      return reply.status(411).send({ message: 'The upload is missing its size. Please try again.' });
    }
    if (Number(contentLength) > MAX_PRODUCT_UPLOAD_BYTES) {
      return reply.status(413).send({
        message: 'The photos are too large.',
        errors: { formErrors: [], fieldErrors: { images: ['Each photo must be 5 MB or smaller (up to 5 photos).'] } },
      });
    }

    const result = await this.proxy.forwardStream(`${CATALOG_URL()}/products`, {
      body: req.raw,
      contentType,
      contentLength,
      authorization,
    });
    reply.status(result.status).send(result.body);
  }

  @Get('products/:id')
  async getProduct(@Param('id') id: string, @Res() reply: FastifyReply) {
    const result = await this.proxy.forward('GET', `${CATALOG_URL()}/products/${id}`);
    reply.status(result.status).send(result.body);
  }

  @Patch('products/:id')
  @UseGuards(RequireAdminGuard)
  async updateProduct(@Param('id') id: string, @Body() body: unknown, @Headers('authorization') authorization: string, @Res() reply: FastifyReply) {
    const result = await this.proxy.forward('PATCH', `${CATALOG_URL()}/products/${id}`, { body, authorization });
    reply.status(result.status).send(result.body);
  }

  @Post('products/:id/stock')
  @UseGuards(RequireAdminGuard)
  async setStock(@Param('id') id: string, @Body() body: unknown, @Headers('authorization') authorization: string, @Res() reply: FastifyReply) {
    const result = await this.proxy.forward('POST', `${CATALOG_URL()}/products/${id}/stock`, { body, authorization });
    reply.status(result.status).send(result.body);
  }
}
