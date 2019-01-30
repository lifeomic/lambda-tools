const path = require('path');
const test = require('ava');

const { useNewContainer, useLambda } = require('../src/lambda');

useLambda(test);

useNewContainer({
  environment: {
    'OTHER_VARIABLE': 2,
    'TEST_PARAMETER': 'test value'
  },
  handler: 'bundled_service.handler',
  mountpoint: path.join(__dirname, 'fixtures')
});

test('Managed containers can use a custom environment', async (test) => {
  const response = await test.context.lambda.get('/');
  test.is(response.status, 200);
  test.is(response.data.parameter, 'test value');
});
