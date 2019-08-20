const fs = require('fs-extra');
const path = require('path');
const test = require('ava');
const uuid = require('uuid/v4');
const crypto = require('crypto');

const WriteBuffer = require('../../src/WriteBuffer');

const { build, useNewContainer, useLambda } = require('../../src/lambda');
const {FIXTURES_DIRECTORY} = require('../helpers/lambda');

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

test.after.always(async (test) => fs.remove(BUILD_DIRECTORY));

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

test.serial(`Returns results when event is undefined`, async (test) => {
  const write = process.stdout.write;
  const buffer = new WriteBuffer();
  process.stdout.write = buffer.write.bind(buffer);

  const context = {};

  try {
    process.env.ENABLE_LAMBDA_LOGGING = true;
    await test.context.lambda.raw(undefined, context);
  } finally {
    delete process.env.ENABLE_LAMBDA_LOGGING;
    process.stdout.write = write;
  }

  test.notRegex(buffer.toString(), /AssertionError/);
  test.regex(buffer.toString(), /Unexpected token/);
});

test.serial(`The lambda function can be invoked with a large event`, async test => {
  const write = process.stdout.write;
  const buffer = new WriteBuffer();
  process.stdout.write = buffer.write.bind(buffer);

  const context = {};
  const event = {
    someLargeValue: crypto.randomBytes(12584038).toString('base64') // 12584038 * 1.333 = 16777216 which is the max size. trying to send message larger than max (16780812 vs. 16777216)
  };

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
