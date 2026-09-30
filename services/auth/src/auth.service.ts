import {
  ConflictException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import * as bcrypt from 'bcrypt';
import * as jwt from 'jsonwebtoken';
import { LoginInput, RegisterInput } from './auth.schemas';
import { PrismaService } from './prisma.service';
import { RedisService } from './redis.service';

type TokenClaims = jwt.JwtPayload & {
  sub: string;
  email: string;
  role: 'customer' | 'admin';
  tokenType: 'access' | 'refresh';
  jti: string;
};

@Injectable()
export class AuthService {
  private readonly accessTtlSeconds = Number(process.env.ACCESS_TOKEN_TTL_SECONDS ?? 900);
  private readonly refreshTtlSeconds = Number(process.env.REFRESH_TOKEN_TTL_SECONDS ?? 604800);
  private readonly lockoutTtlSeconds = Number(process.env.LOGIN_LOCKOUT_TTL_SECONDS ?? 900);
  private readonly maxLoginFailures = Number(process.env.MAX_LOGIN_FAILURES ?? 4);
  private readonly jwtSecret: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {
    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret || jwtSecret.length < 32) {
      throw new Error('JWT_SECRET must be at least 32 characters. See setup.md.');
    }
    this.jwtSecret = jwtSecret;
  }

  async register(input: RegisterInput) {
    const existing = await this.prisma.user.findUnique({ where: { email: input.email } });
    if (existing) throw new ConflictException('An account with that email already exists.');

    const user = await this.prisma.user.create({
      data: {
        email: input.email,
        passwordHash: await bcrypt.hash(input.password, 12),
        firstName: input.firstName,
        lastName: input.lastName,
      },
    });
    return this.publicUser(user);
  }

  async login(input: LoginInput) {
    const lockKey = this.lockKey(input.email);
    if (await this.redis.get(lockKey)) {
      throw new ForbiddenException('Account temporarily locked after too many failed attempts.');
    }

    const user = await this.prisma.user.findUnique({ where: { email: input.email } });
    if (!user || !user.isActive || !(await bcrypt.compare(input.password, user.passwordHash))) {
      const failures = await this.redis.incrementWithExpiry(lockKey, this.lockoutTtlSeconds);
      if (user) {
        await this.prisma.user.update({
          where: { id: user.id },
          data: { failedLoginAttempts: failures, lockedUntil: failures >= this.maxLoginFailures ? new Date(Date.now() + this.lockoutTtlSeconds * 1000) : null },
        });
      }
      throw new UnauthorizedException('Invalid email or password.');
    }

    await this.redis.del(lockKey);
    await this.prisma.user.update({
      where: { id: user.id },
      data: { failedLoginAttempts: 0, lockedUntil: null },
    });
    return this.issueTokenPair(user);
  }

  async refresh(refreshToken: string) {
    const claims = await this.verifyRefreshToken(refreshToken);
    if (await this.redis.get(this.revokedKey(claims.jti))) {
      throw new UnauthorizedException('Refresh token has been revoked.');
    }
    const tokenHash = this.hashToken(refreshToken);
    const storedToken = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
      include: { user: true },
    });
    if (!storedToken || storedToken.revokedAt || storedToken.expiresAt <= new Date() || !storedToken.user.isActive) {
      throw new UnauthorizedException('Refresh token is invalid or expired.');
    }

    await this.prisma.refreshToken.update({
      where: { id: storedToken.id },
      data: { revokedAt: new Date() },
    });
    await this.redis.setFor(this.revokedKey(claims.jti), '1', this.secondsUntilExpiry(claims.exp));
    return this.issueTokenPair(storedToken.user);
  }

  async logout(refreshToken: string) {
    const claims = await this.verifyRefreshToken(refreshToken);
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash: this.hashToken(refreshToken), revokedAt: null },
      data: { revokedAt: new Date() },
    });
    await this.redis.setFor(this.revokedKey(claims.jti), '1', this.secondsUntilExpiry(claims.exp));
  }

  async verifyAccessToken(accessToken: string) {
    try {
      const claims = jwt.verify(accessToken, this.jwtSecret) as unknown as TokenClaims;
      if (claims.tokenType !== 'access') throw new Error('Not an access token');
      const user = await this.prisma.user.findUnique({ where: { id: claims.sub } });
      if (!user || !user.isActive) return { valid: false, reason: 'User is inactive or no longer exists.' };
      return { valid: true, user: this.publicUser(user) };
    } catch {
      return { valid: false, reason: 'Token is invalid or expired.' };
    }
  }

  async getUser(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    return user ? this.publicUser(user) : null;
  }

  private async issueTokenPair(user: { id: string; email: string; role: 'customer' | 'admin' }) {
    const accessToken = this.signToken(user, 'access', this.accessTtlSeconds);
    const refreshToken = this.signToken(user, 'refresh', this.refreshTtlSeconds);
    await this.prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: this.hashToken(refreshToken),
        expiresAt: new Date(Date.now() + this.refreshTtlSeconds * 1000),
      },
    });
    return {
      tokenType: 'Bearer',
      accessToken,
      refreshToken,
      expiresIn: this.accessTtlSeconds,
      user: this.publicUser(user),
    };
  }

  private signToken(user: { id: string; email: string; role: 'customer' | 'admin' }, tokenType: 'access' | 'refresh', expiresIn: number) {
    return jwt.sign({ email: user.email, role: user.role, tokenType }, this.jwtSecret, {
      subject: user.id,
      jwtid: randomUUID(),
      expiresIn,
    });
  }

  private async verifyRefreshToken(token: string): Promise<TokenClaims> {
    try {
      const claims = jwt.verify(token, this.jwtSecret) as unknown as TokenClaims;
      if (claims.tokenType !== 'refresh' || !claims.jti) throw new Error('Not a refresh token');
      return claims;
    } catch {
      throw new UnauthorizedException('Refresh token is invalid or expired.');
    }
  }

  private publicUser(user: { id: string; email: string; role: 'customer' | 'admin'; firstName?: string | null; lastName?: string | null; isActive?: boolean }) {
    return { id: user.id, email: user.email, role: user.role, firstName: user.firstName ?? null, lastName: user.lastName ?? null, isActive: user.isActive ?? true };
  }

  private hashToken(token: string) {
    return createHash('sha256').update(token).digest('hex');
  }

  private lockKey(email: string) { return `login-fail:${email}`; }
  private revokedKey(tokenId: string) { return `revoked:${tokenId}`; }
  private secondsUntilExpiry(exp?: number) { return Math.max(1, (exp ?? Math.floor(Date.now() / 1000)) - Math.floor(Date.now() / 1000)); }
}
