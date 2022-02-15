const test = require('ava');
const sinon = require('sinon');
const { v4: uuid } = require('uuid');
const random = require('lodash/random');
const proxyquire = require('proxyquire');

const { getLogger } = require('../../src/utils/logging');
const { getConnection, getService } = require('../../src/localstack');

test.beforeEach((t) => {
  const logger = getLogger('localstack');

  Object.assign(t.context, { logger });
});

test.afterEach((t) => {
  const { logger } = t.context;
  if (logger.debug.restore) {
    logger.debug.restore();
  }
});

test('getConnection defaults to a default version', async (t) => {
// Stub the docker module to throw errors when fetching images.
// This needs to happen before the localstack helper module is imported
  const docker = proxyquire('../../src/docker', {});
  const error = new Error('Stubbed failure');
  const ensureStub = sinon.stub(docker, 'ensureImage').rejects(error);

  const { getConnection, LOCALSTACK_SERVICES } = proxyquire('../../src/localstack', {
    './docker': docker,
  });

  const services = Object.keys(LOCALSTACK_SERVICES);
  const idx = random(0, services.length - 1);
  const serviceName = services[idx];

  await t.throwsAsync(getConnection({ services: [serviceName] }), { instanceOf: Error, message: error.message });
  sinon.assert.calledOnce(ensureStub);
  sinon.assert.calledWithExactly(ensureStub, sinon.match.any, 'localstack/localstack:0.14.0');
});

test('getConnection allows specifying the localstack version', async (t) => {
// Stub the docker module to throw errors when fetching images.
// This needs to happen before the localstack helper module is imported
  const docker = proxyquire('../../src/docker', {});
  const error = new Error('Stubbed failure');
  const ensureStub = sinon.stub(docker, 'ensureImage').rejects(error);

  const { getConnection, LOCALSTACK_SERVICES } = proxyquire('../../src/localstack', {
    './docker': docker,
  });
  const services = Object.keys(LOCALSTACK_SERVICES);
  const idx = random(0, services.length - 1);
  const serviceName = services[idx];
  const versionTag = uuid();

  await t.throwsAsync(getConnection({ versionTag, services: [serviceName] }), { instanceOf: Error, message: error.message });
  sinon.assert.calledOnce(ensureStub);
  sinon.assert.calledWithExactly(ensureStub, sinon.match.any, `localstack/localstack:${versionTag}`);
});

test('getConnection throws when missing services', async (t) => {
  const { getConnection } = require('../../src/localstack');
  await t.throwsAsync(getConnection());
  await t.throwsAsync(getConnection({ services: [] }), { message: 'No services provided' });
});

test('getConnection throws when specifying the latest tag', async (t) => {
  const { getConnection } = require('../../src/localstack');
  await t.throwsAsync(getConnection({ versionTag: 'latest', services: ['sqs'] }), { message: 'We refuse to try to work with the latest tag' });
});

test('getConnection throws when invalid services are requested', async (t) => {
  const serviceName = uuid();
  const { getConnection } = require('../../src/localstack');
  await t.throwsAsync(getConnection({ services: [serviceName] }), { message: `Unknown service ${serviceName}` });
});

test.serial('will create a child log and debug the localstack setup', async (t) => {
  const { logger } = t.context;
  const logSpy = sinon.stub(logger, 'child');
  let debugSpy;
  logSpy.callsFake(function ({ container } = {}) {
    t.not(container, null);
    const child = logSpy.wrappedMethod.apply(this, arguments);
    debugSpy = sinon.spy(child, 'debug');
    return child;
  });
  const { cleanup } = await getConnection({ services: ['lambda'], versionTag: '0.10.6' });
  await cleanup();
  sinon.assert.called(logSpy);
  sinon.assert.called(debugSpy);
  sinon.assert.calledWith(debugSpy, sinon.match(/Ready\./));
});

test('will throw an exception when extracting a service that is unknown', (t) => {
  const serviceName = uuid();
  t.throws(() => getService(serviceName), { message: `Unknown service ${serviceName}` });
});
