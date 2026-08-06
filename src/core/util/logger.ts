/**
 * Minimal levelled logger.
 *
 * Wrapping `console` gives us one place to silence noise in production builds
 * and to route logs into telemetry later (M8), without touching call sites.
 */

export const enum LogLevel {
  Debug = 0,
  Info = 1,
  Warn = 2,
  Error = 3,
  Silent = 4,
}

let globalLevel: LogLevel = LogLevel.Info;

export function setLogLevel(level: LogLevel): void {
  globalLevel = level;
}

export function getLogLevel(): LogLevel {
  return globalLevel;
}

export class Logger {
  constructor(private readonly scope: string) {}

  debug(message: string, ...args: unknown[]): void {
    if (globalLevel <= LogLevel.Debug) console.debug(`[${this.scope}] ${message}`, ...args);
  }

  info(message: string, ...args: unknown[]): void {
    if (globalLevel <= LogLevel.Info) console.info(`[${this.scope}] ${message}`, ...args);
  }

  warn(message: string, ...args: unknown[]): void {
    if (globalLevel <= LogLevel.Warn) console.warn(`[${this.scope}] ${message}`, ...args);
  }

  error(message: string, ...args: unknown[]): void {
    if (globalLevel <= LogLevel.Error) console.error(`[${this.scope}] ${message}`, ...args);
  }
}

export function createLogger(scope: string): Logger {
  return new Logger(scope);
}
