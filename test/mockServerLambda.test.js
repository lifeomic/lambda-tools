const test = require('ava');
const Docker = require('dockerode');
const AWS = require('aws-sdk');
const promiseRetry = require('promise-retry');
const NestedError = require('nested-error-stacks');
const { v4: uuid } = require('uuid');

const { mockInvocation, verifyInvocation } = require('../src').mockServerLambda;

const { mockServerClient } = require('mockserver-client');

const { getHostAddress, ensureImage } = require('../src/docker');

const MOCKSERVER_IMAGE = 'jamesdbloom/mockserver:mockserver-5.5.1';

async function waitForMockServerToBeReady (mockServerClient) {
  await promiseRetry(async function (retry, retryNumber) {
    try {
      await mockServerClient.retrieveActiveExpectations()
        .then(
          (success) => Promise.resolve(success),
          (error) => { throw error; }
        );
    } catch (error) {
      retry(new NestedError(`MockServer is still not ready after ${retryNumber} connection attempts`, error));
    }
  }, { factor: 1, minTimeout: 100, retries: 1000 });
}

let moduleContext;

test.before(async () => {
  const docker = new Docker();

  await ensureImage(docker, MOCKSERVER_IMAGE);

  const exposedPort = '1080/tcp';
  const container = await docker.createContainer({
    HostConfig: {
      AutoRemove: true,
      PublishAllPorts: true
    },
    ExposedPorts: { [exposedPort]: {} },
    Image: MOCKSERVER_IMAGE
  });

  await container.start();

  const containerData = await container.inspect();
  const host = await getHostAddress();

  // The `exposedPort` value is a constant in this function. That's not
  // a security risk
  // eslint-disable-next-line security/detect-object-injection
  const port = containerData.NetworkSettings.Ports[exposedPort][0].HostPort;

  const msClient = mockServerClient(host, port);
  await waitForMockServerToBeReady(msClient);

  moduleContext = { host, port, mockServerClient: msClient, container };
});

test.beforeEach(async (test) => {
  const { host, port } = moduleContext;
  const lambda = new AWS.Lambda({
    credentials: new AWS.Credentials('dummy-access-key', 'dummy-key-secret'),
    region: 'us-east-1',
    endpoint: `http://${host}:${port}/lambda`
  });

  test.context = {
    lambda,
    mockServerClient: moduleContext.mockServerClient
  };
});

test.after.always(async (test) => {
  if (moduleContext) {
    await moduleContext.container.stop();
  }
});

test('Lambda function invocations can be mocked', async (test) => {
  const { lambda, mockServerClient } = test.context;

  const functionName = `test-${uuid()}`;
  const expectedResponse = { response: 'result' };
  const expectedRequestBody = { test: 'value' };

  // Verify that invocations fail before mocking
  const preMockInvoke = lambda.invoke({
    FunctionName: functionName,
    Payload: JSON.stringify(expectedRequestBody)
  }).promise();
  await test.throwsAsync(() => preMockInvoke);

  await mockInvocation(mockServerClient, functionName, expectedResponse, expectedRequestBody);

  // Verify that invocations succeed after mocking
  const response = await lambda.invoke({
    FunctionName: functionName,
    Payload: JSON.stringify(expectedRequestBody)
  }).promise();

  test.deepEqual(response, {
    StatusCode: 200,
    Payload: JSON.stringify(expectedResponse)
  });
});

test('Lambda function invocations mocking supports times argument (times 1)', async (test) => {
  const { lambda, mockServerClient } = test.context;

  const functionName = `test-${uuid()}`;
  const expectedResponse = { response: 'result' };
  const expectedRequestBody = { test: 'value' };

  // Verify that invocations fail before mocking
  const preMockInvoke = lambda.invoke({
    FunctionName: functionName,
    Payload: JSON.stringify(expectedRequestBody)
  }).promise();
  await test.throwsAsync(() => preMockInvoke);

  await mockInvocation(mockServerClient, functionName, expectedResponse, expectedRequestBody, 1);

  // Verify that first invocation succeeds after mocking
  const response = await lambda.invoke({
    FunctionName: functionName,
    Payload: JSON.stringify(expectedRequestBody)
  }).promise();

  test.deepEqual(response, {
    StatusCode: 200,
    Payload: JSON.stringify(expectedResponse)
  });

  // Verify that subsequent invocations fail
  const postMockInvoke = lambda.invoke({
    FunctionName: functionName,
    Payload: JSON.stringify(expectedRequestBody)
  }).promise();
  await test.throwsAsync(() => postMockInvoke);
});

test('Lambda function invocations mocking supports times argument (unlimited times)', async (test) => {
  const { lambda, mockServerClient } = test.context;

  const functionName = `test-${uuid()}`;
  const expectedResponse = { response: 'result' };
  const expectedRequestBody = { test: 'value' };

  // Verify that invocations fail before mocking
  const preMockInvoke = lambda.invoke({
    FunctionName: functionName,
    Payload: JSON.stringify(expectedRequestBody)
  }).promise();
  await test.throwsAsync(() => preMockInvoke);

  await mockInvocation(mockServerClient, functionName, expectedResponse, expectedRequestBody);
  // verify that multiple invocations don't fail if times argument is not provided when mocking
  await lambda.invoke({
    FunctionName: functionName,
    Payload: JSON.stringify(expectedRequestBody)
  }).promise();
  const response = await lambda.invoke({
    FunctionName: functionName,
    Payload: JSON.stringify(expectedRequestBody)
  }).promise();

  test.deepEqual(response, {
    StatusCode: 200,
    Payload: JSON.stringify(expectedResponse)
  });
});

test('Lambda function invocations can be mocked without specifying the request body', async (test) => {
  const { lambda, mockServerClient } = test.context;

  const functionName = `test-${uuid()}`;
  const expectedResponse = { response: 'result' };
  const expectedRequestBody = { test: 'value' };

  await mockInvocation(mockServerClient, functionName, expectedResponse);

  // Verify that invocations succeed after mocking
  const response = await lambda.invoke({
    FunctionName: functionName,
    Payload: JSON.stringify(expectedRequestBody)
  }).promise();

  test.deepEqual(response, {
    StatusCode: 200,
    Payload: JSON.stringify(expectedResponse)
  });
});

test('Lambda function invocations can be verified', async (test) => {
  const { lambda, mockServerClient } = test.context;

  const functionName = `test-${uuid()}`;
  const expectedResponse = { verifyResponse: 'result' };
  const expectedRequestBody = { verifyRequest: 'value' };

  await mockInvocation(mockServerClient, functionName, expectedResponse, expectedRequestBody);

  // Verifying no invocations should succeed
  await verifyInvocation(mockServerClient, functionName, expectedRequestBody, 0);
  // Verifying one invocation should fail
  try {
    await verifyInvocation(mockServerClient, functionName, expectedRequestBody, 1);
    throw new Error('Verification should have thrown an error');
  } catch (error) {
    // mockClientServer throws `string` type errors instead of real Errors.
    // Ava's `throwsAsync` will fail if the function throws a non-Error, so the
    // contents needs to be manually asserted.
    test.regex(error, /Request not found exactly once/);
  }

  // Invoke so that we can retest verify after invocation
  await lambda.invoke({
    FunctionName: functionName,
    Payload: JSON.stringify(expectedRequestBody)
  }).promise();

  // Verifying one invocation should succeed now
  await verifyInvocation(mockServerClient, functionName, expectedRequestBody, 1);
});
