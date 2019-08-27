const test = require('ava');
const sinon = require('sinon');

test('The afterAll hook handles errors in the beforeAll hook gracefully', async (t) => {
  // Stub the docker module to throw errors when fetching images.
  // This needs to happen before the dynamodb helper module is imported
  const docker = require('../../src/docker');
  const error = new Error('Stubbed failure');
  const ensureStub = sinon.stub(docker, 'ensureImage')
    .rejects(error);

  const { kinesisTestHooks } = require('../../src/kinesis');
  const { afterAll, beforeAll } = kinesisTestHooks(false);

  try {
    await t.throwsAsync(beforeAll, { instanceOf: Error, message: error.message });
    await t.notThrowsAsync(afterAll());
  } finally {
    ensureStub.restore();
  }
});

test('The afterEach hook will ignore a missing context', async t => {
  const { kinesisTestHooks } = require('../../src/kinesis');
  const { afterEach } = kinesisTestHooks(false);
  await t.notThrowsAsync(afterEach(undefined));
});
