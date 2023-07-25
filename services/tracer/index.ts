import { trace } from "@opentelemetry/api";
import { BatchSpanProcessor, ConsoleSpanExporter, BasicTracerProvider } from "@opentelemetry/sdk-trace-base";
import { Resource } from "@opentelemetry/resources";
import { SemanticResourceAttributes } from "@opentelemetry/semantic-conventions";
import { registerInstrumentations } from "@opentelemetry/instrumentation";

import packageJson from '../../package.json';

export const setupTelemetry = (enableTelemetryConsoleLogger: boolean = false) => {

  registerInstrumentations({
    instrumentations: [],
  });

  const resource =
    Resource.default().merge(
      new Resource({
        [SemanticResourceAttributes.SERVICE_NAME]: packageJson.name,
        [SemanticResourceAttributes.SERVICE_VERSION]: packageJson.version,
      })
    );

  const provider = new BasicTracerProvider({ resource });
  if (enableTelemetryConsoleLogger) {
    provider.addSpanProcessor(new BatchSpanProcessor(new ConsoleSpanExporter()));
    provider.register();
  }
  trace.getTracer(packageJson.name, packageJson.version);
}
