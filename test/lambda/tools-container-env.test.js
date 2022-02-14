const test = require('ava');

const { useNewContainer, useLambda } = require('../../src/lambda');
const { FIXTURES_DIRECTORY } = require('../helpers/lambda');

useLambda(test);

useNewContainer({
  environment: {
    'OTHER_VARIABLE': 2,
    'TEST_PARAMETER': 'test value',
  },
  handler: 'bundled_service.handler',
  mountpoint: FIXTURES_DIRECTORY,
});

test('Managed containers can use a custom environment', async (test) => {
  const response = await test.context.lambda.get('/');
  test.is(response.status, 200);
  test.is(response.data.parameter, 'test value');
});
