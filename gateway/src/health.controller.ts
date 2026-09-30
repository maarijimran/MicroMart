import { Controller, Get } from '@nestjs/common';
import { hostname } from 'node:os';

@Controller()
export class HealthController {
  @Get('health')
  health() {
    // Docker gives each container a hostname equal to its (short) container
    // ID by default. Curl this repeatedly once gateway is scaled and
    // sitting behind nginx, and watch `instance` rotate between replicas —
    // that's your proof the load balancing in docker-compose.apps.yml is
    // actually distributing requests, not just configured to.
    return { status: 'ok', instance: hostname() };
  }
}
