const test = require('ava');
const sinon = require('sinon');

test('The afterAll hook handles errors in the beforeAll hook gracefully', async (t) => {
  // Stub the docker module to throw errors when fetching images.
  // This needs to happen before the localstack helper module is imported
  const docker = require('../../src/docker');
  const error = new Error('Stubbed failure');
  const ensureStub = sinon.stub(docker, 'ensureImage')
    .rejects(error);

  const { localStackHooks } = require('../../src/localstack');
  const { afterAll, beforeAll } = localStackHooks({ services: ['es'] });

  try {
    await t.throwsAsync(beforeAll, { instanceOf: Error, message: error.message });
    await t.notThrowsAsync(afterAll());
  } finally {
    ensureStub.restore();
  }
});

test('localStackHooks throws when missing services', (t) => {
  const { localStackHooks } = require('../../src/localstack');
  t.throws(localStackHooks);
});
