import { Injectable, Logger } from '@nestjs/common';
import type { Readable } from 'node:stream';

export interface ProxyResult { status: number; body: unknown }

/**
 * Forwards a request to a downstream service's own REST API. Used for
 * routes where the target service already has a complete, correct REST
 * implementation (Auth's auth flows, Catalog's browsing/admin CRUD,
 * Payment's wallet/payment reads) — reimplementing those over gRPC here
 * would just be duplication for no benefit. See setup.md for which routes
 * proxy versus which go over gRPC.
 */
@Injectable()
export class ProxyService {
  private readonly logger = new Logger(ProxyService.name);

  async forward(method: 'GET' | 'POST' | 'PATCH' | 'DELETE', url: string, options: { body?: unknown; authorization?: string } = {}): Promise<ProxyResult> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (options.authorization) headers.Authorization = options.authorization;

    try {
      const response = await fetch(url, {
        method,
        headers,
        body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      });
      const text = await response.text();
      const body = text ? JSON.parse(text) : null;
      return { status: response.status, body };
    } catch (error) {
      this.logger.error(`Failed to reach ${url}: ${(error as Error).message}`);
      return { status: 503, body: { message: 'The service is temporarily unavailable. Please try again.' } };
    }
  }

  /** Streams a raw request body (e.g. a multipart upload) downstream without buffering it. */
  async forwardStream(
    url: string,
    options: { body: Readable; contentType: string; contentLength: string; authorization?: string },
  ): Promise<ProxyResult> {
    const headers: Record<string, string> = {
      'Content-Type': options.contentType,
      'Content-Length': options.contentLength,
    };
    if (options.authorization) headers.Authorization = options.authorization;

    try {
      const response = await fetch(url, { method: 'POST', headers, body: options.body as unknown as BodyInit, duplex: 'half' } as RequestInit);
      const text = await response.text();
      return { status: response.status, body: text ? JSON.parse(text) : null };
    } catch (error) {
      this.logger.error(`Failed to stream to ${url}: ${(error as Error).message}`);
      return { status: 503, body: { message: 'The service is temporarily unavailable. Please try again.' } };
    }
  }
}
