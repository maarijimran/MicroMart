import { Body, Controller, Post, Res, UseGuards } from '@nestjs/common';
import type { FastifyReply } from 'fastify';
import { AuthRateLimitGuard, GlobalRateLimitGuard } from './rate-limit.guard';
import { ProxyService } from './proxy.service';

const AUTH_URL = () => process.env.AUTH_URL ?? 'http://localhost:3001';

/**
 * Auth doesn't expose these over gRPC (only VerifyToken/GetUser, used
 * internally) — its own REST API is the real, complete implementation of
 * register/login/refresh/logout, so the gateway proxies straight through
 * to it rather than duplicating that logic here.
 */
@Controller('auth')
@UseGuards(GlobalRateLimitGuard)
export class AuthController {
  constructor(private readonly proxy: ProxyService) {}

  @Post('register')
  @UseGuards(AuthRateLimitGuard)
  async register(@Body() body: unknown, @Res() reply: FastifyReply) {
    const result = await this.proxy.forward('POST', `${AUTH_URL()}/auth/register`, { body });
    reply.status(result.status).send(result.body);
  }

  @Post('login')
  @UseGuards(AuthRateLimitGuard)
  async login(@Body() body: unknown, @Res() reply: FastifyReply) {
    const result = await this.proxy.forward('POST', `${AUTH_URL()}/auth/login`, { body });
    reply.status(result.status).send(result.body);
  }

  @Post('refresh')
  async refresh(@Body() body: unknown, @Res() reply: FastifyReply) {
    const result = await this.proxy.forward('POST', `${AUTH_URL()}/auth/refresh`, { body });
    reply.status(result.status).send(result.body);
  }

  @Post('logout')
  async logout(@Body() body: unknown, @Res() reply: FastifyReply) {
    const result = await this.proxy.forward('POST', `${AUTH_URL()}/auth/logout`, { body });
    reply.status(result.status).send(result.body);
  }
}
