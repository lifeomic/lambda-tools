const path = require('path');
const test = require('ava');

const { useNewContainer, useLambda } = require('../src/lambda');

useLambda(test);

useNewContainer({
  handler: 'bundled_service.handler',
  mountpoint: path.join(__dirname, 'fixtures')
});

test('The helper client can create a new container', async (test) => {
  const response = await test.context.lambda.get('/');
  test.is(response.status, 200);
  test.is(response.data.service, 'lambda-test');
});
