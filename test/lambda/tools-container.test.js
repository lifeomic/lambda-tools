const test = require('ava');

const { useNewContainer, useLambda } = require('../../src/lambda');

const { FIXTURES_DIRECTORY } = require('../helpers/lambda');

useLambda(test);

useNewContainer({
  handler: 'bundled_service.handler',
  mountpoint: FIXTURES_DIRECTORY
});

test('The helper client can create a new container', async (test) => {
  const response = await test.context.lambda.get('/');
  test.is(response.status, 200);
  test.is(response.data.service, 'lambda-test');
});
