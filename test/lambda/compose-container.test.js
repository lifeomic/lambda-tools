const test = require('ava');
const debug = require('debug');
const { WriteBuffer } = require('../../src/WriteBuffer');

const { useLambdaContainer } = require('../helpers/lambda');

const LAMBDA_IMAGE = 'lambci/lambda:nodejs6.10';

useLambdaContainer(test, LAMBDA_IMAGE);

test.serial('The helper client can invoke compose containers', async (test) => {
  const response = await test.context.lambda.get('/');
  test.is(response.status, 200);
  test.is(response.data.service, 'lambda-test');
});

test.serial('The helper client can invoke the conatainer with a raw event and context', async (test) => {
  const result = await test.context.lambda.raw({ path: '/foo' }, {});
  test.is(result.statusCode, 404);
});

test.serial('The helper can log Lambda execution output', async (test) => {
  const write = process.stdout.write;
  const buffer = new WriteBuffer();
  process.stdout.write = buffer.write.bind(buffer);
  debug.enable('lambda-tools:*');

  try {
    await test.context.lambda.get('/');
  } finally {
    process.stdout.write = write;
  }

  test.regex(buffer.toString(), /container output was:/);
});

// We rely on test ordering to ensure that this test case does not interfere
// with the others in this suite (this test case stops the container)
test.serial('The helper reports invocation errors', async (test) => {
  const { container } = test.context;
  await container.stop();
  // The format of this error message seems to differ based on timing of the
  // container cleanup. We'll just settle for getting an error...
  await test.throwsAsync(() => test.context.lambda.get('/'));
});
