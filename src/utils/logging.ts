import createDebug, { Debugger, debug } from 'debug';

const libName = 'lambda-tools';

const loggers: Record<string, Logger> = {};
const consoleLog = console.log.bind(console);

export interface Logger {
  info: Debugger;
  error: Debugger;
  warn: Debugger;
  debug: Debugger;
  child(name: string): Logger;
}

interface LoggerExtension {
  logger: Debugger;
  name: string;
  enabled?: boolean;
  log?: typeof console.log;
}

function extendLogger ({ logger, name, enabled, log }: LoggerExtension): Debugger {
  const childLogger: Debugger = logger.extend(name);
  childLogger.log = log || logger.log;
  if (enabled || logger.enabled) {
    debug.names.push(new RegExp(`^${childLogger.namespace}$`))
  }

  return childLogger;
}

function createChildLogger (name: string, root: Debugger): Logger {
  return {
    info: extendLogger({ logger: root, name: 'info', log: consoleLog, enabled: true }),
    error: extendLogger({ logger: root, name: 'error', enabled: true }),
    warn: extendLogger({ logger: root, name: 'warn', enabled: true }),
    debug: extendLogger({ logger: root, name: 'debug', log: consoleLog, enabled: root.enabled }),
    child: (name: string) => {
      const child = root.extend(name);
      if (root.enabled) {
        debug.names.push(new RegExp(`^${child.namespace}$`))
      }

      return createChildLogger(name, child);
    }
  };
}

export function getLogger (name: string): Logger {
  const fullName = `${libName}:${name}`;
  if (!loggers[fullName]) {
    loggers[fullName] = createChildLogger(fullName, createDebug(fullName));
  }
  return loggers[fullName];
}
