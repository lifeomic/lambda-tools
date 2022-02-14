const test = require('ava');

const { useLocalStack, LOCALSTACK_SERVICES } = require('../../src/localstack');

const services = Object.keys(LOCALSTACK_SERVICES);
const serviceName = 'lambda';

useLocalStack(test, { services: [serviceName] });

test(`${serviceName} should be available`, async (t) => {
  const { localStack: { services } } = t.context;
  const service = services[serviceName];
  await t.notThrowsAsync(service.isReady(service.client));
});

services.forEach((nextServiceName) => {
  if (nextServiceName === serviceName) {
    return;
  }

  test(`${nextServiceName} should not be listed in the services`, (t) => {
    const { localStack: { services } } = t.context;
    const service = services[nextServiceName];
    t.is(service, undefined);
  });
});

test('will error when missing services', (t) => {
  t.throws(() => useLocalStack(test, {}));
  t.throws(() => useLocalStack(test));
});

test.serial('will return the output from localstack', (t) => {
  const { localStack: { getOutput } } = t.context;
  t.true(getOutput().includes('\nReady.'));
});

test.serial('can reset the logs', (t) => {
  const { localStack: { getOutput, clearOutput } } = t.context;
  t.not(getOutput().length, 0);
  clearOutput();
  t.is(getOutput().length, 0);
});
