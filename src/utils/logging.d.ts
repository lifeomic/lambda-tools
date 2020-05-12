export interface Logger {
  info(...any: any): void;
  error(...any: any): void;
  warn(...any: any): void;
  debug(...any: any): void;
  child(name: string): Logger;
}

export function getLogger(name: string): Logger;
