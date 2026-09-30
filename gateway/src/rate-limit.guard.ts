import { CanActivate, ExecutionContext, HttpException, HttpStatus, Injectable, mixin, Type } from '@nestjs/common';
import { RedisService } from './redis.service';

/**
 * A sliding-window-ish limiter: INCR + EXPIRE on a per-IP, per-route key.
 * Backed by Redis (not an in-memory counter) specifically so the limit holds
 * even once the gateway is scaled to multiple replicas behind a load
 * balancer — see the project brief, Redis section 6.1.
 */
export function createRateLimitGuard(name: string, max: number, windowSeconds: number): Type<CanActivate> {
  @Injectable()
  class RateLimitGuardImpl implements CanActivate {
    constructor(private readonly redis: RedisService) {}

    async canActivate(context: ExecutionContext): Promise<boolean> {
      const request = context.switchToHttp().getRequest();
      const ip = request.ip ?? request.socket?.remoteAddress ?? 'unknown';
      const key = `ratelimit:${name}:${ip}`;
      const count = await this.redis.incrementWithExpiry(key, windowSeconds);
      if (count > max) {
        throw new HttpException('Too many requests — slow down and try again shortly.', HttpStatus.TOO_MANY_REQUESTS);
      }
      return true;
    }
  }
  return mixin(RateLimitGuardImpl);
}

export const GlobalRateLimitGuard = createRateLimitGuard(
  'global',
  Number(process.env.RATE_LIMIT_MAX ?? 100),
  Number(process.env.RATE_LIMIT_WINDOW_SECONDS ?? 60),
);

export const AuthRateLimitGuard = createRateLimitGuard(
  'auth',
  Number(process.env.AUTH_RATE_LIMIT_MAX ?? 5),
  Number(process.env.AUTH_RATE_LIMIT_WINDOW_SECONDS ?? 60),
);
