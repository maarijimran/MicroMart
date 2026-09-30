import { BadRequestException, Body, Controller, Get, Headers, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { AuthenticatedUser, RequireUserGuard } from './jwt.guard';
import { createOrderSchema, listOrdersQuerySchema } from './order.schemas';
import { OrderService } from './order.service';

@Controller('orders')
@UseGuards(RequireUserGuard)
export class OrderController {
  constructor(private readonly orders: OrderService) {}

  @Post()
  create(@Req() request: { user: AuthenticatedUser }, @Body() body: unknown, @Headers('idempotency-key') idempotencyKey?: string) {
    if (idempotencyKey !== undefined && (!idempotencyKey.trim() || idempotencyKey.length > 255)) throw new BadRequestException('Idempotency-Key must be 1-255 characters.');
    return this.orders.createOrder(request.user.id, parse(createOrderSchema, body), idempotencyKey?.trim());
  }

  @Get()
  list(@Req() request: { user: AuthenticatedUser }, @Query() query: unknown) {
    return this.orders.listOrders(request.user.id, request.user.role, parse(listOrdersQuerySchema, query));
  }

  @Get(':id')
  get(@Req() request: { user: AuthenticatedUser }, @Param('id') id: string) {
    return this.orders.getOrder(id, request.user.id, request.user.role);
  }
}

function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) throw new BadRequestException({ message: 'Validation failed.', errors: result.error.flatten() });
  return result.data;
}
