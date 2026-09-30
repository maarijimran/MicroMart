import { Controller } from '@nestjs/common';
import { GrpcMethod } from '@nestjs/microservices';
import { AuthService } from './auth.service';

@Controller()
export class AuthGrpcController {
  constructor(private readonly auth: AuthService) {}

  @GrpcMethod('AuthService', 'VerifyToken')
  async verifyToken(request: { accessToken?: string; access_token?: string }) {
    const result = await this.auth.verifyAccessToken(request.accessToken ?? request.access_token ?? '');
    if (!result.valid || !result.user) return { valid: false, reason: result.reason };
    const user = result.user;
    return {
      valid: true,
      userId: user.id,
      email: user.email,
      role: user.role,
    };
  }

  @GrpcMethod('AuthService', 'GetUser')
  async getUser(request: { userId?: string; user_id?: string }) {
    const user = await this.auth.getUser(request.userId ?? request.user_id ?? '');
    if (!user) return { found: false };
    return {
      found: true,
      userId: user.id,
      email: user.email,
      role: user.role,
      firstName: user.firstName ?? '',
      lastName: user.lastName ?? '',
      isActive: user.isActive,
    };
  }
}
