import { BadRequestException, Controller, Get, Query, UseGuards } from '@nestjs/common';
import { RequireAdminGuard } from './jwt.guard';
import { listNotificationsQuerySchema } from './notification.schemas';
import { NotificationService } from './notification.service';

/**
 * This service has no functional REST surface by design (see the project
 * brief, section 4.6) — it's a pure event consumer. This one admin-only
 * route exists purely so you have something to check in Postman confirming
 * a notification actually got logged, without needing direct DB access.
 */
@Controller()
@UseGuards(RequireAdminGuard)
export class NotificationController {
  constructor(private readonly notifications: NotificationService) {}

  @Get('notifications')
  list(@Query() query: unknown) {
    const result = listNotificationsQuerySchema.safeParse(query);
    if (!result.success) throw new BadRequestException({ message: 'Validation failed.', errors: result.error.flatten() });
    return this.notifications.listNotifications(result.data);
  }
}
