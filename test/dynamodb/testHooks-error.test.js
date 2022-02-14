const test = require('ava');
const sinon = require('sinon');

test.serial('The afterAll hook handles errors in the beforeAll hook gracefully', async (test) => {
  // Stub the docker module to throw errors when fetching images.
  // This needs to happen before the dynamodb helper module is imported
  const docker = require('../../src/docker');
  const error = new Error('Stubbed failure');
  const ensureStub = sinon.stub(docker, 'ensureImage')
    .rejects(error);

  const { dynamoDBTestHooks } = require('../../src/dynamodb');
  const { afterAll, beforeAll } = dynamoDBTestHooks(false);

  try {
    await test.throwsAsync(beforeAll, { instanceOf: Error, message: error.message });
    await afterAll();
  } finally {
    ensureStub.restore();
  }
});

// Some test runners (like Jest) continue to process hooks and tests even when
// hooks fail. This can create invalid AWS clients in some cases. The clients
// are sometimes instantiated with the default configuration which means that
// DynamoDB test cases may execute against real tables and cause data corruption
// or destruction.
test.serial('the beforeEach hook does not create clients when beforeAll fails', async (test) => {
  // Stub the docker module to throw errors when fetching images.
  // This needs to happen before the dynamodb helper module is imported
  const docker = require('../../src/docker');
  const error = new Error('Stubbed failure');
  const ensureStub = sinon.stub(docker, 'ensureImage')
    .rejects(error);

  const { dynamoDBTestHooks } = require('../../src/dynamodb');
  const { beforeAll, beforeEach } = dynamoDBTestHooks(false);

  try {
    await test.throwsAsync(beforeAll, { instanceOf: Error, message: error.message });
    await test.throwsAsync(beforeEach, { message: 'Invalid DynamoDB test configuration.' });
  } finally {
    ensureStub.restore();
  }
});

test('The afterEach hook will ignore a missing context', async (t) => {
  const { dynamoDBTestHooks } = require('../../src/dynamodb');
  const { afterEach } = dynamoDBTestHooks(false);
  await t.notThrowsAsync(afterEach(undefined));
});
