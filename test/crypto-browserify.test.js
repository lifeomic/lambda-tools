const fsExtra = require('fs-extra');
const path = require('path');
const test = require('ava');
const { v4: uuid } = require('uuid');
const {
  build,
  createLambdaExecutionEnvironment,
  destroyLambdaExecutionEnvironment,
  LambdaRunner,
} = require('../src/lambda');

const { FIXTURES_DIRECTORY } = require('./helpers/lambda');

const BUILD_DIRECTORY = path.join(FIXTURES_DIRECTORY, 'build', uuid());

test.after.always(async () => {
  await fsExtra.emptyDir(BUILD_DIRECTORY);
  await fsExtra.rmdir(BUILD_DIRECTORY);
});

[
  '10.23.0',
  '12.20.0',
].forEach((nodeVersion) => {
  const outputPath = path.join(BUILD_DIRECTORY, uuid());
  const entrypoint = path.join(FIXTURES_DIRECTORY, 'crypto-browserify.js');
  test(`${nodeVersion}: crypto is substituted for crypto-browserify `, async (test) => {
    const result = await build({
      nodeVersion,
      entrypoint,
      outputPath,
      serviceName: 'test-service',
    });
    test.false(result.hasErrors());

    const executionEnvironment = await createLambdaExecutionEnvironment({
      image: `lambci/lambda:nodejs${nodeVersion.split('.')[0]}.x`,
      mountpoint: outputPath,
    });
    try {
      const runner = new LambdaRunner(executionEnvironment.container.id, null, 'crypto-browserify.handler');
      const result = await runner.invoke({});
      test.deepEqual(result, 'crypto === crypto-browserify');
    } finally {
      await destroyLambdaExecutionEnvironment(executionEnvironment);
    }
  });
});
