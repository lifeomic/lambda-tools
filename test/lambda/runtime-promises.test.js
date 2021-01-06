const fs = require('fs-extra');
const path = require('path');
const test = require('ava');
const { v4: uuid } = require('uuid');

const { build, useNewContainer, useLambda } = require('../../src/lambda');
const { FIXTURES_DIRECTORY } = require('../helpers/lambda');

const BUILD_DIRECTORY = path.join(FIXTURES_DIRECTORY, 'build', uuid());

// Ava's `serial` hook decorator needs to be used so that `useNewContainer` is
// executed before the useLambda hooks are executed
test.serial.before(async () => {
  const buildResults = await build({
    entrypoint: path.join(FIXTURES_DIRECTORY, 'runtime_promises.js'),
    outputPath: BUILD_DIRECTORY,
    serviceName: 'runtime-promises'
  });

  if (buildResults.hasErrors()) {
    console.error(buildResults.toJson().errors);
    throw new Error('Lambda build failed!');
  }

  useNewContainer({
    handler: 'runtime_promises.handler',
    // Using Node 6.10 gives a more thorough test since this isn't normally
    // supported.
    image: 'lambci/lambda:nodejs12.x',
    mountpoint: BUILD_DIRECTORY
  });
});

useLambda(test);

test.after.always(async (test) => fs.remove(BUILD_DIRECTORY));

test.serial(`A lambda handler can return a promise`, async (test) => {
  const result = await test.context.lambda.raw({}, {});
  test.is(result, 'hello from the promised land!');
});
