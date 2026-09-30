import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { ListNotificationsQuery, OrderOutcomeEvent } from './notification.schemas';

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * "Sends" a notification for a saga outcome. There's no real email
   * provider here — logging is the entire implementation, on purpose (see
   * the project brief, section 1: no real email delivery in this project).
   */
  async notify(eventType: 'order.confirmed' | 'order.cancelled', event: OrderOutcomeEvent) {
    const message = this.composeMessage(eventType, event);

    try {
      await this.prisma.notificationLog.create({
        data: { orderId: event.orderId, eventType, channel: 'email', message },
      });
    } catch (error) {
      // Redelivery raced us here and another instance already logged this
      // exact (orderId, eventType) pair — the unique constraint caught it,
      // safe to treat as already-handled rather than an error.
      if ((error as { code?: string }).code === 'P2002') {
        this.logger.log(`Notification for ${event.orderId}/${eventType} already logged — skipping.`);
        return;
      }
      throw error;
    }

    // This is the "send" — a real implementation would call an email/SMS
    // provider here instead.
    this.logger.log(`[simulated email] ${message}`);
  }

  async listNotifications(query: ListNotificationsQuery) {
    const [notifications, total] = await this.prisma.$transaction([
      this.prisma.notificationLog.findMany({
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.notificationLog.count(),
    ]);
    return { notifications, total, page: query.page, pageSize: query.pageSize };
  }

  private composeMessage(eventType: 'order.confirmed' | 'order.cancelled', event: OrderOutcomeEvent): string {
    if (eventType === 'order.confirmed') {
      return `Your order ${event.orderId} is confirmed — thanks for shopping with MicroMart!`;
    }
    const reason = event.reason ? ` (${event.reason})` : '';
    return `Your order ${event.orderId} was cancelled${reason}.`;
  }
}
