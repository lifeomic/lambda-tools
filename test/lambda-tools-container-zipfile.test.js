const path = require('path');
const test = require('ava');

const { useNewContainer, useLambda, createLambdaExecutionEnvironment } = require('../src/lambda');

useLambda(test);

useNewContainer({
  handler: 'bundled_service.handler',
  zipfile: path.join(__dirname, 'fixtures', 'bundled_service.zip')
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
      mountpoint: path.join(__dirname, 'fixtures', 'build'),
      zipfile: 'some.zip'
    })
  , 'Only one of mountpoint or zipfile can be provided');
});
