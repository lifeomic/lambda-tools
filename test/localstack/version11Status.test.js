const test = require('ava');

const { LOCALSTACK_SERVICES, getConnection } = require('../../src/localstack');
const services = Object.keys(LOCALSTACK_SERVICES);

test.before(async t => {
  const { mappedServices, cleanup } = await getConnection({ services, versionTag: '0.11.6' });
  Object.assign(t.context, { mappedServices, cleanup });
});

test.after.always(async t => {
  const { cleanup } = t.context;
  if (cleanup) {
    await cleanup();
  }
});

services.forEach(serviceName => {
  test(`${serviceName} should be available`, async t => {
    const { mappedServices } = t.context;
    const service = mappedServices[serviceName];
    await t.notThrowsAsync(service.isReady(service.client));
  });

  // It appears this is necessary to get code coverage.
  test(`${serviceName} can configure a valid client`, async t => {
    const { mappedServices } = t.context;
    const { config, connection } = mappedServices[serviceName];
    const client = LOCALSTACK_SERVICES[serviceName].getClient({ config, connection });
    await t.notThrowsAsync(LOCALSTACK_SERVICES[serviceName].isReady(client));
  });
});
