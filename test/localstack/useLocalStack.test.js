const test = require('ava');
const random = require('lodash/random');

const { useLocalStack, LOCALSTACK_SERVICES } = require('../../src/localstack');

const services = Object.keys(LOCALSTACK_SERVICES);
const idx = random(0, services.length - 1);
const serviceName = services[idx];

useLocalStack(test, { services: [serviceName] });

test(`${serviceName} should be available`, async t => {
  const { localStack: { services } } = t.context;
  const service = services[serviceName];
  await t.notThrowsAsync(service.isReady(service.client));
});

services.forEach(nextServiceName => {
  if (nextServiceName === serviceName) {
    return;
  }

  test(`${nextServiceName} should not be listed in the services`, t => {
    const { localStack: { services } } = t.context;
    const service = services[nextServiceName];
    t.is(service, undefined);
  });
});

test('will error when missing services', t => {
  t.throws(() => useLocalStack(test, {}));
  t.throws(() => useLocalStack(test));
});
