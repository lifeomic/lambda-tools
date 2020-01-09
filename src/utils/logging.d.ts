export interface Logger {
  info(...any): void;
  error(...any): void;
  warn(...any): void;
  debug(...any): void;
  child(name: string): Logger;
}

export function getLogger(name: string): Logger;
