const fs = require('fs-extra');
const path = require('path');
const test = require('ava');
const uuid = require('uuid/v4');
const WriteBuffer = require('../src/WriteBuffer');

const { build, useNewContainer, useLambda } = require('../src/lambda');

const FIXTURES_DIRECTORY = path.join(__dirname, 'fixtures');
const BUILD_DIRECTORY = path.join(FIXTURES_DIRECTORY, 'build', uuid());

// Ava's `serial` hook decorator needs to be used so that `useNewContainer` is
// executed before the useLambda hooks are executed
test.serial.before(async () => {
  const buildResults = await build({
    entrypoint: path.join(FIXTURES_DIRECTORY, 'runtime_events.js'),
    outputPath: BUILD_DIRECTORY,
    serviceName: 'runtime-events'
  });

  if (buildResults.hasErrors()) {
    console.error(buildResults.toJson().errors);
    throw new Error('Lambda build failed!');
  }

  useNewContainer({
    handler: 'runtime_events.handler',
    image: 'lambci/lambda:nodejs8.10',
    mountpoint: BUILD_DIRECTORY
  });
});

useLambda(test);

test.after.always((test) => fs.remove(BUILD_DIRECTORY));

test.serial(`The lambda function logs process events`, async (test) => {
  const write = process.stdout.write;
  const buffer = new WriteBuffer();
  process.stdout.write = buffer.write.bind(buffer);

  const context = {};
  const event = {};

  try {
    process.env.ENABLE_LAMBDA_LOGGING = true;
    await test.context.lambda.raw(event, context);
  } finally {
    delete process.env.ENABLE_LAMBDA_LOGGING;
    process.stdout.write = write;
  }

  test.notRegex(buffer.toString(), /AssertionError/);
  test.regex(buffer.toString(), /'beforeExit'/);
});
