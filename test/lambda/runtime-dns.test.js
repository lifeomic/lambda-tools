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
    enableDnsRetry: true,
    entrypoint: path.join(FIXTURES_DIRECTORY, 'runtime_dns.js'),
    outputPath: BUILD_DIRECTORY,
    serviceName: 'runtime-dns',
  });

  if (buildResults.hasErrors()) {
    console.error(buildResults.toJson().errors);
    throw new Error('Lambda build failed!');
  }

  useNewContainer({
    handler: 'runtime_dns.handler',
    image: 'lambci/lambda:nodejs12.x',
    mountpoint: BUILD_DIRECTORY,
  });
});

useLambda(test);

test.after.always(() => fs.remove(BUILD_DIRECTORY));

test.serial('DNS lookups can be automatically retried', async (test) => {
  // The test assertions are part of the lambda fixture
  const result = await test.context.lambda.raw({}, {});
  test.is(result, 'success!');
});
