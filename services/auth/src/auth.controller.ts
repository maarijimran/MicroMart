import { BadRequestException, Body, Controller, Get, Headers, HttpCode, Post, UnauthorizedException } from '@nestjs/common';
import { z } from 'zod';
import { AuthService } from './auth.service';
import { loginSchema, logoutSchema, refreshSchema, registerSchema } from './auth.schemas';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('register')
  async register(@Body() body: unknown) {
    return { user: await this.auth.register(parse(registerSchema, body)) };
  }

  @Post('login')
  @HttpCode(200)
  login(@Body() body: unknown) {
    return this.auth.login(parse(loginSchema, body));
  }

  @Post('refresh')
  @HttpCode(200)
  refresh(@Body() body: unknown) {
    return this.auth.refresh(parse(refreshSchema, body).refreshToken);
  }

  @Post('logout')
  @HttpCode(204)
  async logout(@Body() body: unknown) {
    await this.auth.logout(parse(logoutSchema, body).refreshToken);
  }

  @Get('me')
  async me(@Headers('authorization') authorization?: string) {
    const token = authorization?.startsWith('Bearer ') ? authorization.slice(7) : undefined;
    if (!token) throw new UnauthorizedException('A Bearer access token is required.');
    const result = await this.auth.verifyAccessToken(token);
    if (!result.valid) throw new UnauthorizedException(result.reason);
    return { user: result.user };
  }
}

function parse<T>(schema: z.ZodType<T>, body: unknown): T {
  const result = schema.safeParse(body);
  if (!result.success) throw new BadRequestException({ message: 'Validation failed.', errors: result.error.flatten() });
  return result.data;
}
