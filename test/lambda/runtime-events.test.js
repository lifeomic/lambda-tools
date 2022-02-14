const fs = require('fs-extra');
const path = require('path');
const test = require('ava');
const { v4: uuid } = require('uuid');
const crypto = require('crypto');
const debug = require('debug');

const { WriteBuffer } = require('../../src/WriteBuffer');

const { build, useNewContainer, useLambda } = require('../../src/lambda');
const { FIXTURES_DIRECTORY } = require('../helpers/lambda');

const BUILD_DIRECTORY = path.join(FIXTURES_DIRECTORY, 'build', uuid());

// Ava's `serial` hook decorator needs to be used so that `useNewContainer` is
// executed before the useLambda hooks are executed
test.serial.before(async () => {
  const buildResults = await build({
    entrypoint: path.join(FIXTURES_DIRECTORY, 'runtime_events.js'),
    outputPath: BUILD_DIRECTORY,
    serviceName: 'runtime-events',
  });

  if (buildResults.hasErrors()) {
    console.error(buildResults.toJson().errors);
    throw new Error('Lambda build failed!');
  }

  useNewContainer({
    handler: 'runtime_events.handler',
    image: 'lambci/lambda:nodejs12.x',
    mountpoint: BUILD_DIRECTORY,
  });
});

useLambda(test);

test.after.always(() => fs.remove(BUILD_DIRECTORY));

async function testEventExecution (test, event) {
  const write = process.stdout.write;
  const buffer = new WriteBuffer();
  process.stdout.write = buffer.write.bind(buffer);
  debug.enable('lambda-tools:*');

  const context = {};

  try {
    await test.context.lambda.raw(event, context);
  } finally {
    process.stdout.write = write;
  }

  test.notRegex(buffer.toString(), /AssertionError/);
  test.regex(buffer.toString(), /'beforeExit'/);
}

test.serial('The lambda function logs process events', async (test) => {
  await testEventExecution(test, {});
});

test.serial('The lambda function logs process string events', async (test) => {
  await testEventExecution(test, '{}');
});

test.serial('Returns results when event is undefined', async (test) => {
  const write = process.stdout.write;
  const buffer = new WriteBuffer();
  process.stdout.write = buffer.write.bind(buffer);

  const context = {};
  debug.enable('lambda-tools:*');

  try {
    await test.context.lambda.raw(undefined, context);
  } finally {
    process.stdout.write = write;
  }

  test.notRegex(buffer.toString(), /AssertionError/);
  test.regex(buffer.toString(), /Unexpected token/);
});

test.serial('The lambda function can be invoked with a large event', async (test) => {
  const write = process.stdout.write;
  const buffer = new WriteBuffer();
  process.stdout.write = buffer.write.bind(buffer);

  const context = {};
  const event = {
    someLargeValue: crypto.randomBytes(12584038).toString('base64'), // 12584038 * 1.333 = 16777216 which is the max size. trying to send message larger than max (16780812 vs. 16777216)
  };
  debug.enable('lambda-tools:*');

  try {
    await test.context.lambda.raw(event, context);
  } finally {
    process.stdout.write = write;
  }

  test.notRegex(buffer.toString(), /AssertionError/);
  test.regex(buffer.toString(), /'beforeExit'/);
});
