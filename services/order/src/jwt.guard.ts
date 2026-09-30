import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import * as jwt from 'jsonwebtoken';

export interface AuthenticatedUser { id: string; email: string; role: 'customer' | 'admin'; }

@Injectable()
export class RequireUserGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const authorization: string | undefined = request.headers?.authorization;
    const token = authorization?.startsWith('Bearer ') ? authorization.slice(7) : undefined;
    if (!token) throw new UnauthorizedException('A Bearer access token is required.');
    const secret = process.env.JWT_SECRET;
    if (!secret) throw new Error('JWT_SECRET is required. See setup.md.');
    try {
      const claims = jwt.verify(token, secret) as jwt.JwtPayload & { email?: string; role?: string };
      if (!claims.sub || (claims.role !== 'customer' && claims.role !== 'admin')) throw new Error('Invalid claims');
      request.user = { id: claims.sub, email: claims.email ?? '', role: claims.role } satisfies AuthenticatedUser;
      return true;
    } catch { throw new UnauthorizedException('Access token is invalid or expired.'); }
  }
}
