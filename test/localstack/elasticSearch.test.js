const test = require('ava');

const { LOCALSTACK_SERVICES, getConnection } = require('../../src/localstack');

test.before(async t => {
  const { mappedServices, cleanup } = await getConnection({ services: ['elasticsearch'] });
  Object.assign(t.context, { mappedServices, cleanup });
});

test.after.always(t => {
  const { cleanup } = t.context;
  if (cleanup) {
    cleanup();
  }
});

test('elasticsearch should be available', async t => {
  const { mappedServices } = t.context;
  const service = mappedServices.elasticsearch;
  await t.notThrowsAsync(service.isReady(service.client));
});

// It appears this is necessary to get code coverage.
test('elasticsearch can configure a valid client', async t => {
  const { mappedServices } = t.context;
  const { config, connection } = mappedServices.elasticsearch;
  const client = LOCALSTACK_SERVICES.elasticsearch.getClient({ config, connection });
  await t.notThrowsAsync(LOCALSTACK_SERVICES.elasticsearch.isReady(client));
});
