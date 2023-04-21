// logger-service.ts
import { Logger, createLogger, transports, format } from 'winston';

interface ILogger {
  info(message: string, ...meta: any[]): void;
  error(message: string, ...meta: any[]): void;
  warn(message: string, ...meta: any[]): void;
  debug(message: string, ...meta: any[]): void;
}

class LoggerService implements ILogger {
  private logger: ILogger;

  constructor(customLogger?: ILogger) {
    this.logger = customLogger || this.createDefaultLogger();
  }

  private createDefaultLogger(): Logger {
    return createLogger({
      level: 'info',
      format: format.combine(
        format.colorize(),
        format.timestamp(),
        format.printf(({ timestamp, level, message }) => {
          return `${timestamp} [${level}]: ${message}`;
        }),
      ),
      transports: [new transports.Console()],
    });
  }

  info(message: string, ...meta: any[]): void {
    this.logger.info(message, ...meta);
  }

  error(message: string, ...meta: any[]): void {
    this.logger.error(message, ...meta);
  }

  warn(message: string, ...meta: any[]): void {
    this.logger.warn(message, ...meta);
  }

  debug(message: string, ...meta: any[]): void {
    this.logger.debug(message, ...meta);
  }
}

export { LoggerService, ILogger };