// Bootstraps OpenTelemetry. This file MUST be the very first thing main.ts
// imports — auto-instrumentation works by monkey-patching modules (http, pg,
// amqplib, @grpc/grpc-js, etc.) at require() time, so it has to run before
// anything else pulls those modules in.
import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-grpc';
import { PrometheusExporter } from '@opentelemetry/exporter-prometheus';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { ATTR_SERVICE_NAME } from '@opentelemetry/semantic-conventions';

const serviceName = process.env.OTEL_SERVICE_NAME ?? 'unknown-service';
const metricsPort = Number(process.env.OTEL_METRICS_PORT ?? 9464);
const tracesEndpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT ?? 'http://localhost:4317';

const sdk = new NodeSDK({
  resource: resourceFromAttributes({ [ATTR_SERVICE_NAME]: serviceName }),
  traceExporter: new OTLPTraceExporter({ url: tracesEndpoint }),
  // Prometheus is pull-based: this starts its own tiny HTTP server that
  // Prometheus scrapes on a schedule, rather than pushing metrics anywhere.
  metricReader: new PrometheusExporter({ port: metricsPort }),
  instrumentations: [
    getNodeAutoInstrumentations({
      // Instrumenting every fs.readFile call floods traces with noise for
      // no benefit in a service this size — everything else stays on.
      '@opentelemetry/instrumentation-fs': { enabled: false },
    }),
  ],
});

sdk.start();

process.on('SIGTERM', () => {
  sdk.shutdown().finally(() => process.exit(0));
});
