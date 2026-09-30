import { BadRequestException, Body, Controller, Get, Headers, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { AuthenticatedUser, RequireUserGuard } from './jwt.guard';
import { GlobalRateLimitGuard } from './rate-limit.guard';
import { OrderClient } from './order.client';
import { checkoutSchema, paginationQuerySchema } from './gateway.schemas';

/**
 * This is the one route in the whole gateway that actually demonstrates
 * REST -> gRPC translation end to end: a single REST call here triggers a
 * gRPC call to Order Service, which then kicks off the choreographed saga
 * across Catalog and Payment over RabbitMQ. See the project brief, section 5.
 */
@Controller('orders')
@UseGuards(GlobalRateLimitGuard, RequireUserGuard)
export class OrderController {
  constructor(private readonly orderClient: OrderClient) {}

  @Post()
  async checkout(
    @Body() body: unknown,
    @Req() request: { user: AuthenticatedUser },
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    const result = checkoutSchema.safeParse(body);
    if (!result.success) throw new BadRequestException({ message: 'Validation failed.', errors: result.error.flatten() });

    return this.orderClient.createOrder(
      request.user.id,
      idempotencyKey ?? randomUUID(),
      result.data.items,
    );
  }

  @Get()
  async listOrders(@Req() request: { user: AuthenticatedUser }, @Query() query: unknown) {
    const result = paginationQuerySchema.safeParse(query);
    if (!result.success) throw new BadRequestException({ message: 'Validation failed.', errors: result.error.flatten() });
    return this.orderClient.listOrders(request.user.id, request.user.role, result.data.page, result.data.pageSize);
  }

  @Get(':id')
  async getOrder(@Param('id') id: string, @Req() request: { user: AuthenticatedUser }) {
    return this.orderClient.getOrder(id, request.user.id, request.user.role);
  }
}
