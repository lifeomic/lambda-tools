const path = require('path');
const test = require('ava');
const unzip = require('unzipper');
const tmp = require('tmp-promise');
const sinon = require('sinon');

const { useNewContainer, useLambda, createLambdaExecutionEnvironment, destroyLambdaExecutionEnvironment } = require('../../src/lambda');
const { FIXTURES_DIRECTORY } = require('../helpers/lambda');

useLambda(test);

useNewContainer({
  handler: 'bundled_service.handler',
  zipfile: path.join(FIXTURES_DIRECTORY, 'bundled_service.zip')
});

test('The helper client can create a new container', async (test) => {
  const response = await test.context.lambda.get('/');
  test.is(response.status, 200);
  test.is(response.data.service, 'lambda-test');
});

test('An error is thrown if both zipfile and mountpoint arguments are provided', async (test) => {
  await test.throwsAsync(() =>
    createLambdaExecutionEnvironment({
      environment: { AWS_XRAY_CONTEXT_MISSING: null },
      mountpoint: path.join(FIXTURES_DIRECTORY, 'build'),
      zipfile: 'some.zip'
    })
  , 'Only one of mountpoint or zipfile can be provided');
});

test('will use mountpointParent as the directory for unzipping if provided', async (test) => {
  const tempWork = await tmp.dir({ dir: process.cwd(), prefix: '.mountpointParent-test-' });
  try {
    // Spy on unzipper to make sure the temp path is used
    const extractSpy = sinon.spy(unzip, 'Extract');

    const env = await createLambdaExecutionEnvironment({
      environment: { AWS_XRAY_CONTEXT_MISSING: null },
      zipfile: path.join(FIXTURES_DIRECTORY, 'bundled_service.zip'),
      mountpointParent: tempWork.path
    });

    await destroyLambdaExecutionEnvironment(env);

    sinon.assert.calledWith(extractSpy, sinon.match({
      path: sinon.match((path) => path.startsWith(tempWork.path))
    }));
  } finally {
    await tempWork.cleanup();
  }
});
