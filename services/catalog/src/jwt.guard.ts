import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import * as jwt from 'jsonwebtoken';

export interface AuthenticatedUser {
  id: string;
  email: string;
  role: 'customer' | 'admin';
}

/**
 * Verifies the JWT locally against the secret shared with the Auth service —
 * no gRPC round-trip needed for every request. Attaches `user` to the request.
 */
@Injectable()
export class RequireAdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const authorization: string | undefined = request.headers?.authorization;
    const token = authorization?.startsWith('Bearer ') ? authorization.slice(7) : undefined;
    if (!token) throw new UnauthorizedException('A Bearer access token is required.');

    const secret = process.env.JWT_SECRET;
    if (!secret) throw new Error('JWT_SECRET is required. See setup.md.');

    try {
      const claims = jwt.verify(token, secret) as jwt.JwtPayload & AuthenticatedUser;
      if (claims.role !== 'admin') {
        throw new ForbiddenException('This action requires an admin account.');
      }
      if (!claims.sub) throw new UnauthorizedException('Access token is missing its subject claim.');
      request.user = { id: claims.sub, email: claims.email, role: claims.role } satisfies AuthenticatedUser;
      return true;
    } catch (error) {
      if (error instanceof ForbiddenException) throw error;
      throw new UnauthorizedException('Access token is invalid or expired.');
    }
  }
}
