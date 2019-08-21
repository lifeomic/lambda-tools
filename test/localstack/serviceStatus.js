const test = require('ava');

const {LOCALSTACK_SERVICES, getConnection} = require('../../src/localstack');
const services = Object.keys(LOCALSTACK_SERVICES);

test.before(async t => {
  const {mappedServices, cleanup} = await getConnection({services});
  Object.assign(t.context, {mappedServices, cleanup});
});

test.after.always(t => {
  const {cleanup} = t.context;
  if (cleanup) {
    cleanup();
  }
});

services.forEach(serviceName => {
  test(`${serviceName} should be available`, async t => {
    const {mappedServices} = t.context;
    const service = mappedServices[serviceName];
    await t.notThrowsAsync(service.isReady(service.client));
  });
});
