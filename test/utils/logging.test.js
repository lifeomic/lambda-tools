const test = require('ava');
const proxyquire = require('proxyquire').noPreserveCache();
const debug = require('debug');

function validateLogLevelsEnabled (t, logger, debugEnabled = false) {
  t.is(logger.info.enabled, true);
  t.is(logger.error.enabled, true);
  t.is(logger.warn.enabled, true);
  t.is(logger.debug.enabled, debugEnabled);
}

function requireLogging (debugSetting = '') {
  process.env.DEBUG = debugSetting;
  debug.enable(debug.load());
  return proxyquire('../../src/utils/logging', {});
}

test.serial('will default debug to disabled', t => {
  const name = 'testLib';
  const { getLogger } = requireLogging();
  const logger = getLogger(name);
  validateLogLevelsEnabled(t, logger);
});

test.serial('Multiple calls will return the same object', t => {
  const name = 'testLib';
  const { getLogger } = requireLogging();
  const logger = getLogger(name);
  validateLogLevelsEnabled(t, logger);
  t.is(getLogger(name), logger);
});

test.serial('can enable debug logs', t => {
  const name = 'testLib';
  const { getLogger } = requireLogging(`lambda-tools:${name}`);
  const logger = getLogger(name);
  validateLogLevelsEnabled(t, logger, true);
});

test.serial('can get child logger', t => {
  const name = 'testLib';
  const { getLogger } = requireLogging(`lambda-tools:${name}`);
  const logger = getLogger(name);
  const aChild = logger.child('aChild');
  validateLogLevelsEnabled(t, aChild, true);
  t.is(aChild.info.namespace, `lambda-tools:${name}:aChild:info`);

  const bChild = aChild.child('bChild');
  validateLogLevelsEnabled(t, bChild, true);
  t.is(bChild.info.namespace, `lambda-tools:${name}:aChild:bChild:info`);
});

[
  'lambda-tools:*',
  '*'
].forEach(debugValue => {
  test.serial(`can all log levels to debug using ${debugValue}`, t => {
    const name = 'testLib';
    const { getLogger } = requireLogging(debugValue);
    const logger = getLogger(name);
    validateLogLevelsEnabled(t, logger, true);
  });
});
