const fs = require('fs-extra');
const path = require('path');
const test = require('ava');
const uuid = require('uuid/v4');

const { build, useNewContainer, useLambda } = require('../src/lambda');

const FIXTURES_DIRECTORY = path.join(__dirname, 'fixtures');
const BUILD_DIRECTORY = path.join(FIXTURES_DIRECTORY, 'build', uuid());

test.before(async () => {
  const buildResults = await build({
    entrypoint: path.join(FIXTURES_DIRECTORY, 'runtime_dns.js'),
    outputPath: BUILD_DIRECTORY,
    serviceName: 'runtime-dns'
  });

  if (buildResults.hasErrors()) {
    console.error(buildResults.toJson().errors);
    throw new Error('Lambda build failed!');
  }

  useNewContainer({
    handler: 'runtime_dns.handler',
    image: 'lambci/lambda:nodejs8.10',
    mountpoint: BUILD_DIRECTORY
  });
});

useLambda(test);

test.always.after((test) => fs.remove(BUILD_DIRECTORY));

test.serial('DNS lookups are not retried by default', async (test) => {
  // The test assertions are part of the lambda fixture
  const result = await test.context.lambda.raw({}, {});
  test.not(result, 'success!');
});
