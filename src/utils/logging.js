const createDebug = require('debug');

const libName = 'lambda-tools';

const loggers = {};
const consoleLog = console.log.bind(console);

function extendLogger ({ logger, name, enabled, log }) {
  const childLogger = logger.extend(name);
  childLogger.log = log || logger.log;
  childLogger.enabled = enabled || logger.enabled;
  return childLogger;
}

function createChildLogger (name, root) {
  return {
    info: extendLogger({ logger: root, name: 'info', log: consoleLog, enabled: true }),
    error: extendLogger({ logger: root, name: 'error', enabled: true }),
    warn: extendLogger({ logger: root, name: 'warn', enabled: true }),
    debug: extendLogger({ logger: root, name: 'debug', log: consoleLog, enabled: root.enabled }),
    child: (name) => {
      const child = root.extend(name);
      child.enabled = root.enabled;
      return createChildLogger(name, child);
    }
  };
}

function getLogger (name) {
  const fullName = `${libName}:${name}`;
  if (!loggers[fullName]) {
    loggers[fullName] = createChildLogger(fullName, createDebug(fullName));
  }
  return loggers[fullName];
}

module.exports = {
  getLogger
};
