const build = require('../src/webpack');
const fs = require('fs-extra');
const JSZip = require('jszip');
const path = require('path');
const sinon = require('sinon');
const test = require('ava');
const uuid = require('uuid/v4');

const SUPPORTED_NODE_VERSIONS = ['6.10', '8.10'];

test.beforeEach((test) => {
  test.context.buildDirectory = path.join(__dirname, 'fixtures', 'build', uuid());
});

test.always.afterEach((test) => fs.remove(test.context.buildDirectory));

test('Setting WEBPACK_MODE to development disables minification', async (test) => {
  const source = path.join(__dirname, 'fixtures', 'lambda_service.js');
  const bundle = path.join(test.context.buildDirectory, 'lambda_service.js');

  let buildResults = await build({
    entrypoint: source,
    outputPath: test.context.buildDirectory,
    serviceName: 'test-service'
  });
  test.false(buildResults.hasErrors());

  // eslint-disable-next-line security/detect-non-literal-fs-filename
  const minifiedSize = (await fs.stat(bundle)).size;

  process.env.WEBPACK_MODE = 'development';
  try {
    buildResults = await build({
      entrypoint: source,
      outputPath: test.context.buildDirectory,
      serviceName: 'test-service'
    });
    test.false(buildResults.hasErrors());
  } finally {
    delete process.env.WEBPACK_MODE;
  }

  // eslint-disable-next-line security/detect-non-literal-fs-filename
  const fullSize = (await fs.stat(bundle)).size;
  test.true(fullSize > minifiedSize);
});

test('The webpack configuration can be transformed', async (test) => {
  const source = path.join(__dirname, 'fixtures', 'lambda_service.js');
  const bundle = path.join(test.context.buildDirectory, 'lambda_service.js');

  const transformer = sinon.stub().callsFake(function (config) {
    config.externals['koa-router'] = 'koa-router';
    return config;
  });

  const buildResultExternalKoaRouter = await build({
    configTransformer: transformer,
    entrypoint: source,
    outputPath: test.context.buildDirectory,
    serviceName: 'test-service'
  });
  test.false(buildResultExternalKoaRouter.hasErrors());

  // eslint-disable-next-line security/detect-non-literal-fs-filename
  const webpackedContents = await fs.readFile(bundle, 'utf8');
  // Make sure that koa-router is really treated as external as the transformed config would require
  test.truthy(/e\.exports=require\("koa-router"\)/.test(webpackedContents));

  sinon.assert.calledOnce(transformer);
  sinon.assert.calledWith(transformer, sinon.match.object);
});

test('Typescript bundles are supported by default', async (test) => {
  const source = path.join(__dirname, 'fixtures', 'ts_lambda_service.ts');

  const result = await build({
    entrypoint: source,
    outputPath: test.context.buildDirectory,
    serviceName: 'test-service'
  });
  test.false(result.hasErrors());

  test.true(await fs.pathExists(path.join(test.context.buildDirectory, 'ts_lambda_service.js')));
  test.true(await fs.pathExists(path.join(test.context.buildDirectory, 'ts_lambda_service.js.map')));
});

test('Node 6 bundles are produced by default', async (test) => {
  const source = path.join(__dirname, 'fixtures', 'lambda_service.js');

  const transformer = sinon.stub().returnsArg(0);

  const result = await build({
    configTransformer: transformer,
    entrypoint: source,
    outputPath: test.context.buildDirectory,
    serviceName: 'test-service'
  });
  test.false(result.hasErrors());

  sinon.assert.calledOnce(transformer);
  sinon.assert.calledWithExactly(transformer, sinon.match.object);

  const config = transformer.firstCall.args[0];
  const babel = config.module.rules.find((rule) => rule.loader === 'babel-loader');
  test.is(babel.options.presets[0][1].targets.node, '6.10');
});

test('A custom Node version can be used', async (test) => {
  const source = path.join(__dirname, 'fixtures', 'lambda_service.js');

  const nodeVersion = '8.10';
  const transformer = sinon.stub().returnsArg(0);

  const result = await build({
    configTransformer: transformer,
    entrypoint: source,
    nodeVersion,
    outputPath: test.context.buildDirectory,
    serviceName: 'test-service'
  });
  test.false(result.hasErrors());

  sinon.assert.calledOnce(transformer);
  sinon.assert.calledWithExactly(transformer, sinon.match.object);

  const config = transformer.firstCall.args[0];
  const babel = config.module.rules.find((rule) => rule.loader === 'babel-loader');
  test.is(babel.options.presets[0][1].targets.node, nodeVersion);
});

test('Lambda archives can be produced', async (test) => {
  const source = path.join(__dirname, 'fixtures', 'lambda_service.js');
  const bundle = path.join(test.context.buildDirectory, 'lambda_service.js.zip');

  const buildResults = await build({
    entrypoint: source,
    outputPath: test.context.buildDirectory,
    serviceName: 'test-service',
    zip: true
  });
  test.false(buildResults.hasErrors());

  const zip = new JSZip();
  // eslint-disable-next-line security/detect-non-literal-fs-filename
  await zip.loadAsync(await fs.readFile(bundle));
  test.truthy(zip.file('lambda_service.js'));
});

test('Multiple bundles can be produced at one time', async (test) => {
  const buildResults = await build({
    entrypoint: [
      path.join(__dirname, 'fixtures', 'lambda_graphql.js'),
      path.join(__dirname, 'fixtures', 'lambda_service.js')
    ],
    outputPath: test.context.buildDirectory,
    serviceName: 'test-service'
  });
  test.false(buildResults.hasErrors());

  test.true(await fs.pathExists(path.join(test.context.buildDirectory, 'lambda_graphql.js')));
  test.true(await fs.pathExists(path.join(test.context.buildDirectory, 'lambda_service.js')));
});

test('Multiple bundles can be produced with mixed source types', async (test) => {
  const buildResults = await build({
    entrypoint: [
      path.join(__dirname, 'fixtures', 'lambda_service.js'),
      path.join(__dirname, 'fixtures', 'ts_lambda_service.ts')
    ],
    outputPath: test.context.buildDirectory,
    serviceName: 'test-service'
  });
  test.false(buildResults.hasErrors());

  test.true(await fs.pathExists(path.join(test.context.buildDirectory, 'lambda_service.js')));
  test.true(await fs.pathExists(path.join(test.context.buildDirectory, 'ts_lambda_service.js')));
});

test('Bundles can use custom names', async (test) => {
  const buildResults = await build({
    entrypoint: [
      path.join(__dirname, 'fixtures', 'lambda_graphql.js:graphql.js'),
      path.join(__dirname, 'fixtures', 'lambda_service.js:lambda/service.js')
    ],
    outputPath: test.context.buildDirectory,
    serviceName: 'test-service'
  });
  test.false(buildResults.hasErrors());

  test.true(await fs.pathExists(path.join(test.context.buildDirectory, 'graphql.js')));
  test.true(await fs.pathExists(path.join(test.context.buildDirectory, 'lambda', 'service.js')));
});

test('Multi-entry bundling cannot be used with bundle zipping', async (test) => {
  const options = {
    entrypoint: [
      path.join(__dirname, 'fixtures', 'lambda_service.js'),
      path.join(__dirname, 'fixtures', 'lambda_graphql.js')
    ],
    outputPath: test.context.buildDirectory,
    serviceName: 'test-service',
    zip: true
  };

  await test.throws(build(options), /multiple entrypoints/i);
});

test.serial('Bundles are produced in the current working directory by default', async (test) => {
  const cwd = process.cwd();
  await fs.ensureDir(test.context.buildDirectory);

  try {
    process.chdir(test.context.buildDirectory);
    const buildResults = await build({
      entrypoint: path.join(__dirname, 'fixtures', 'lambda_service.js'),
      serviceName: 'test-service'
    });
    test.false(buildResults.hasErrors());

    test.true(await fs.pathExists('lambda_service.js'));
  } finally {
    process.chdir(cwd);
  }
});

for (const nodeVersion of SUPPORTED_NODE_VERSIONS) {
  // Test that a common pattern can be packed without a regression
  test.serial(`Can webpack files that use await inside for...of statements targetting ${nodeVersion}`, async (test) => {
    const source = path.join(__dirname, 'fixtures', 'async_test.js');

    const result = await build({
      nodeVersion,
      entrypoint: source,
      outputPath: test.context.buildDirectory,
      serviceName: 'test-service'
    });
    test.false(result.hasErrors());
  });
}
