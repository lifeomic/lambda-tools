const test = require('ava');

const { useLambdaContainer } = require('../helpers/lambda');

const containerConfig = {
  environment: {
    TEST_PARAMETER: 'a test value'
  }
};

const LAMBDA_IMAGE = 'lambci/lambda:nodejs6.10';

useLambdaContainer(test, LAMBDA_IMAGE, {containerConfig});

test('Compose containers can use a custom environment', async (test) => {
  const response = await test.context.lambda.get('/');
  test.is(response.status, 200);
  test.is(response.data.parameter, 'a test value');
});
