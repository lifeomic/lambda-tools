const test = require('ava');
const sinon = require('sinon');
const uuid = require('uuid/v4');
const random = require('lodash/random');
const proxyquire = require('proxyquire');

test.afterEach(t => {
  if (console.log.restore) {
    console.log.restore();
  }
});

test('getConnection defaults to the latest localstack version', async t => {
// Stub the docker module to throw errors when fetching images.
// This needs to happen before the localstack helper module is imported
  const docker = proxyquire('../../src/docker', {});
  const error = new Error('Stubbed failure');
  const ensureStub = sinon.stub(docker, 'ensureImage').rejects(error);

  const { getConnection, LOCALSTACK_SERVICES } = proxyquire('../../src/localstack', {
    './docker': docker
  });

  const services = Object.keys(LOCALSTACK_SERVICES);
  const idx = random(0, services.length - 1);
  const serviceName = services[idx];

  await t.throwsAsync(getConnection({ services: [serviceName] }), { instanceOf: Error, message: error.message });
  sinon.assert.calledOnce(ensureStub);
  sinon.assert.calledWithExactly(ensureStub, sinon.match.any, 'localstack/localstack:latest');
});

test('getConnection allows specifying the localstack version', async t => {
// Stub the docker module to throw errors when fetching images.
// This needs to happen before the localstack helper module is imported
  const docker = proxyquire('../../src/docker', {});
  const error = new Error('Stubbed failure');
  const ensureStub = sinon.stub(docker, 'ensureImage').rejects(error);

  const { getConnection, LOCALSTACK_SERVICES } = proxyquire('../../src/localstack', {
    './docker': docker
  });
  const services = Object.keys(LOCALSTACK_SERVICES);
  const idx = random(0, services.length - 1);
  const serviceName = services[idx];
  const versionTag = uuid();

  await t.throwsAsync(getConnection({ versionTag, services: [serviceName] }), { instanceOf: Error, message: error.message });
  sinon.assert.calledOnce(ensureStub);
  sinon.assert.calledWithExactly(ensureStub, sinon.match.any, `localstack/localstack:${versionTag}`);
});

test('getConnection throws when missing services', async t => {
  const { getConnection } = require('../../src/localstack');
  await t.throwsAsync(getConnection());
  await t.throwsAsync(getConnection({ services: [] }), 'No services provided');
});

test('getConnection throws when invalid services are requested', async t => {
  const serviceName = uuid();
  const { getConnection } = require('../../src/localstack');
  await t.throwsAsync(getConnection({ services: [serviceName] }), `The following services are provided, (${serviceName}`);
});

test.serial('can log localstack startup logs', async t => {
  const logSpy = sinon.spy(console, 'log');
  process.env.DEBUG_LOCALSTACK = 'true';
  const { getConnection } = proxyquire.noPreserveCache()('../../src/localstack', {});
  const { cleanup } = await getConnection({ services: [ 'lambda' ], versionTag: '0.10.6' });
  await cleanup();
  sinon.assert.called(logSpy);
  sinon.assert.calledWith(logSpy, sinon.match(new RegExp('[0-9a-f]+: Ready.')));
});
