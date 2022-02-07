import anyTest, { TestInterface } from 'ava';

import {
  LOCALSTACK_SERVICES,
  getConnection,
  waitForServicesToBeReady,
  LocalStackServices,
  LocalStackService,
} from '../../src/localstack';
const services = Object.keys(LOCALSTACK_SERVICES) as (keyof LocalStackServices)[];

const test = anyTest as TestInterface<{ cleanup?: () => Promise<void>; mappedServices: Record<keyof LocalStackServices, LocalStackService> }>

test.before(async t => {
  const { mappedServices, cleanup } = await getConnection({ services, versionTag: '0.14.0' });
  Object.assign(t.context, { mappedServices, cleanup });
});

test.after.always(async t => {
  const { cleanup } = t.context;
  if (cleanup) {
    await cleanup();
  }
});

services.forEach((serviceName) => {
  test(`${serviceName} should be available`, async (t) => {
    const { mappedServices } = t.context;
    const service = mappedServices[serviceName];
    await t.notThrowsAsync(service.isReady(service.client));
  });

  // It appears this is necessary to get code coverage.
  test(`${serviceName} can configure a valid client`, async (t) => {
    const { mappedServices } = t.context;
    const { config, connection } = mappedServices[serviceName];
    const client = LOCALSTACK_SERVICES[serviceName].getClient({ config, connection });
    await t.notThrowsAsync(LOCALSTACK_SERVICES[serviceName].isReady(client));
  });
});

test.serial('waitForServicesToBeReady', async (t) => {
  const { mappedServices } = t.context;
  const servicesConfigs = Object.keys(mappedServices).reduce((acc, serviceName) => ({
    ...acc,
    [serviceName]: {
      url: mappedServices[serviceName as keyof LocalStackServices].connection.url
    }
  }), {});
  await t.notThrowsAsync(waitForServicesToBeReady(servicesConfigs));
});
