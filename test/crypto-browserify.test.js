const crypto = require('crypto');
const fs = require('fs-extra');
const path = require('path');
const test = require('ava');
const uuid = require('uuid/v4');

const { build, useNewContainer, useLambda } = require('../src/lambda');

const FIXTURES_DIRECTORY = path.join(__dirname, 'fixtures');
const BUILD_DIRECTORY = path.join(FIXTURES_DIRECTORY, 'build', uuid());

// Ava's `serial` hook decorator needs to be used so that `useNewContainer` is
// executed before the useLambda hooks are executed
test.serial.before(async () => {
  const buildResults = await build({
    entrypoint: path.join(FIXTURES_DIRECTORY, 'crypto-browserify.js'),
    outputPath: BUILD_DIRECTORY,
    serviceName: 'crypto-browserify'
  });

  if (buildResults.hasErrors()) {
    console.error(buildResults.toJson().errors);
    throw new Error('Lambda build failed!');
  }

  useNewContainer({
    handler: 'crypto-browserify.handler',
    image: 'lambci/lambda:nodejs8.10',
    mountpoint: BUILD_DIRECTORY
  });
});

useLambda(test);

test.after.always((test) => fs.remove(BUILD_DIRECTORY));

test.serial('crypto is substituted for crypto-browserify', async (test) => {
  const result = await test.context.lambda.raw({}, {});
  test.deepEqual(result, crypto.constants.defaultCoreCipherList);
});
