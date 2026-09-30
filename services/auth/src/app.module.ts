import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthGrpcController } from './auth.grpc.controller';
import { AuthService } from './auth.service';
import { PrismaService } from './prisma.service';
import { RedisService } from './redis.service';

@Module({
  controllers: [AuthController, AuthGrpcController],
  providers: [AuthService, PrismaService, RedisService],
})
export class AppModule {}
