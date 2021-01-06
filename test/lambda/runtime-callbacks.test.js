const fs = require('fs-extra');
const path = require('path');
const test = require('ava');
const { v4: uuid } = require('uuid');
const debug = require('debug');
const { WriteBuffer } = require('../../src/WriteBuffer');

const { build, useNewContainer, useLambda } = require('../../src/lambda');
const { FIXTURES_DIRECTORY } = require('../helpers/lambda');

const BUILD_DIRECTORY = path.join(FIXTURES_DIRECTORY, 'build', uuid());

// Ava's `serial` hook decorator needs to be used so that `useNewContainer` is
// executed before the useLambda hooks are executed
test.serial.before(async () => {
  const buildResults = await build({
    entrypoint: path.join(FIXTURES_DIRECTORY, 'runtime_callbacks.js'),
    outputPath: BUILD_DIRECTORY,
    serviceName: 'runtime-callbacks'
  });

  if (buildResults.hasErrors()) {
    console.error(buildResults.toJson().errors);
    throw new Error('Lambda build failed!');
  }

  useNewContainer({
    handler: 'runtime_callbacks.handler',
    image: 'lambci/lambda:nodejs12.x',
    mountpoint: BUILD_DIRECTORY
  });
});

useLambda(test);

test.after.always(async (test) => fs.remove(BUILD_DIRECTORY));

test.serial(`The lambda function logs multiple callback invocations`, async (test) => {
  const write = process.stdout.write;
  const buffer = new WriteBuffer();
  process.stdout.write = buffer.write.bind(buffer);

  const context = {};
  const event = {};
  debug.enable('lambda-tools:*');

  try {
    await test.context.lambda.raw(event, context);
  } finally {
    process.stdout.write = write;
  }

  test.regex(buffer.toString(), /called back multiple times/);
});
