const build = require('../src/webpack');
const fs = require('fs-extra');
const JSZip = require('jszip');
const path = require('path');
const sinon = require('sinon');
const test = require('ava');
const uuid = require('uuid/v4');
const { createLambdaExecutionEnvironment, destroyLambdaExecutionEnvironment, LambdaRunner } = require('../src/lambda');
const { FIXTURES_DIRECTORY } = require('./helpers/lambda');
const find = require('lodash/find');

const SUPPORTED_NODE_VERSIONS = ['8.10', '10.16.3', '12.13.0'];

test.beforeEach((test) => {
  test.context.buildDirectory = path.join(FIXTURES_DIRECTORY, 'build', uuid());
});

test.afterEach(() => {
  sinon.restore();
});

test.afterEach.always(async (test) => fs.remove(test.context.buildDirectory));

test('Setting WEBPACK_MODE to development disables minification', async (test) => {
  const source = path.join(FIXTURES_DIRECTORY, 'lambda_service.js');
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
  const source = path.join(FIXTURES_DIRECTORY, 'lambda_service.js');
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
  test.truthy(/module\.exports = require\("koa-router"\);/.test(webpackedContents));

  sinon.assert.calledOnce(transformer);
  sinon.assert.calledWith(transformer, sinon.match.object);
});

test('TSConfig files are supported', async (test) => {
  const sourceDir = path.join(FIXTURES_DIRECTORY, 'lambda-with-tsconfig');
  const source = path.join(sourceDir, 'index.ts');
  const tsconfig = path.join(sourceDir, 'tsconfig.json');

  const transformer = sinon.stub().returnsArg(0);

  const result = await build({
    tsconfig,
    configTransformer: transformer,
    entrypoint: source,
    outputPath: test.context.buildDirectory,
    serviceName: 'test-service'
  });
  test.false(result.hasErrors());
  test.true(await fs.pathExists(path.join(test.context.buildDirectory, 'index.js')));
  test.true(await fs.pathExists(path.join(test.context.buildDirectory, 'index.js.map')));

  const config = transformer.firstCall.args[0];
  test.truthy(config.module.rules.find(rule => find(rule.use, { loader: 'ts-loader' })));
});

test('Typescript bundles are supported by default', async (test) => {
  const source = path.join(FIXTURES_DIRECTORY, 'ts_lambda_service.ts');

  const result = await build({
    entrypoint: source,
    outputPath: test.context.buildDirectory,
    serviceName: 'test-service'
  });
  test.false(result.hasErrors());

  test.true(await fs.pathExists(path.join(test.context.buildDirectory, 'ts_lambda_service.js')));
  test.true(await fs.pathExists(path.join(test.context.buildDirectory, 'ts_lambda_service.js.map')));
  await fs.remove(path.join(FIXTURES_DIRECTORY, 'ts_lambda_service.js'));
  await fs.remove(path.join(FIXTURES_DIRECTORY, 'ts_lambda_service..js.map'));
});

test('Typescript code has async/await removed for good X-Ray integration', async (test) => {
  const sourceRoot = path.join(FIXTURES_DIRECTORY, 'typescript-es2017');
  const source = path.join(sourceRoot, 'async_test.ts');

  const result = await build({
    tsconfig: path.join(sourceRoot, 'tsconfig.json'),
    entrypoint: source,
    outputPath: test.context.buildDirectory,
    serviceName: 'test-service'
  });
  test.false(result.hasErrors());

  // eslint-disable-next-line security/detect-non-literal-fs-filename
  const contents = await fs.readFile(path.join(test.context.buildDirectory, 'async_test.js'), 'utf8');
  test.is(/await handler/.test(contents), false, 'await found');
});

test('Node 12 bundles are produced by default', async (test) => {
  const source = path.join(FIXTURES_DIRECTORY, 'lambda_service.js');

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
  test.is(babel.options.presets[0][1].targets.node, '12.13.0');
});

test('A custom Node version can be used', async (test) => {
  const source = path.join(FIXTURES_DIRECTORY, 'lambda_service.js');

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
  const source = path.join(FIXTURES_DIRECTORY, 'lambda_service.js');
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

test('Lambda archives can be produced repeatably', async (test) => {
  const source = path.join(FIXTURES_DIRECTORY, 'lambda_service.js');
  const bundle = path.join(test.context.buildDirectory, 'lambda_service.js.zip');

  const buildConfig = {
    entrypoint: source,
    outputPath: test.context.buildDirectory,
    serviceName: 'test-service',
    zip: true
  };

  let buildResults = await build(buildConfig);
  test.false(buildResults.hasErrors());
  buildResults = await build(buildConfig);
  test.false(buildResults.hasErrors());

  const zip = new JSZip();
  // eslint-disable-next-line security/detect-non-literal-fs-filename
  await zip.loadAsync(await fs.readFile(bundle));
  test.truthy(zip.file('lambda_service.js'));
  test.falsy(zip.file('lambda_service.js.zip'));
});

test('Multiple bundles can be produced at one time', async (test) => {
  const buildResults = await build({
    entrypoint: [
      path.join(FIXTURES_DIRECTORY, 'lambda_graphql.js'),
      path.join(FIXTURES_DIRECTORY, 'lambda_service.js')
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
      path.join(FIXTURES_DIRECTORY, 'lambda_service.js'),
      path.join(FIXTURES_DIRECTORY, 'ts_lambda_service.ts')
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
      path.join(FIXTURES_DIRECTORY, 'lambda_graphql.js:graphql.js'),
      path.join(FIXTURES_DIRECTORY, 'lambda_service.js:lambda/service.js')
    ],
    outputPath: test.context.buildDirectory,
    serviceName: 'test-service'
  });
  test.false(buildResults.hasErrors());

  test.true(await fs.pathExists(path.join(test.context.buildDirectory, 'graphql.js')));
  test.true(await fs.pathExists(path.join(test.context.buildDirectory, 'lambda', 'service.js')));
});

test('Bundles for multiple entries can be zipped', async (test) => {
  await build({
    entrypoint: [
      path.join(FIXTURES_DIRECTORY, 'lambda_graphql.js:graphql.js'),
      path.join(FIXTURES_DIRECTORY, 'lambda_service.js:lambda/service.js')
    ],
    outputPath: test.context.buildDirectory,
    serviceName: 'test-service',
    zip: true
  });

  test.true(await fs.pathExists(path.join(test.context.buildDirectory, 'graphql.js.zip')));
  test.true(await fs.pathExists(path.join(test.context.buildDirectory, 'lambda/service.js.zip')));
});

test.serial('Expand input entrypoint directory into multiple entrypoints', async (test) => {
  const multiLambdasDir = path.join(test.context.buildDirectory, 'multi-lambdas');
  await fs.mkdirp(multiLambdasDir);
  await fs.copy(path.join(FIXTURES_DIRECTORY, 'multi-lambdas'), multiLambdasDir);
  const emptyDir = path.join(multiLambdasDir, 'empty');
  await fs.mkdirp(emptyDir);

  const originalFsStat = fs.stat;
  const unreadableFile = path.join(multiLambdasDir, 'unreadable/index.js');

  const stubStat = sinon.stub(fs, 'stat').callsFake(function (file) {
    if (file === unreadableFile) {
      throw new Error('Simulated unreadable');
    }

    return originalFsStat(file);
  });

  await build({
    entrypoint: [
      multiLambdasDir
    ],
    outputPath: test.context.buildDirectory,
    serviceName: 'test-service',
    zip: true
  });

  sinon.assert.calledWith(stubStat, unreadableFile);

  // Loop through each lambda function that we expect to see in output
  for (const funcName of [
    'func1',
    'func2',
    'func3',
    'func4'
  ]) {
    test.true(await fs.pathExists(path.join(test.context.buildDirectory, `${funcName}.js.zip`)));
    const zip = new JSZip();
    // eslint-disable-next-line security/detect-non-literal-fs-filename
    await zip.loadAsync(await fs.readFile(path.join(test.context.buildDirectory, `${funcName}.js.zip`)));
    test.truthy(zip.file(`${funcName}.js`));
    test.truthy(zip.file(`${funcName}.js.map`));
  }
});

test.serial('Bundles are produced in the current working directory by default', async (test) => {
  const cwd = process.cwd();
  await fs.ensureDir(test.context.buildDirectory);

  try {
    process.chdir(test.context.buildDirectory);
    const buildResults = await build({
      entrypoint: path.join(FIXTURES_DIRECTORY, 'lambda_service.js'),
      serviceName: 'test-service'
    });
    test.false(buildResults.hasErrors());

    test.true(await fs.pathExists('lambda_service.js'));
  } finally {
    process.chdir(cwd);
  }
});

async function assertSourceMapBehavior (test, options, expectMappingUrl, expectSourceMapRegister) {
  const cwd = process.cwd();

  try {
    process.chdir(path.join(__dirname, '../src'));
    const buildResults = await build({
      outputPath: test.context.buildDirectory,
      entrypoint: path.join(FIXTURES_DIRECTORY, 'lambda_service.js'),
      serviceName: 'test-service',
      ...options
    });

    test.false(buildResults.hasErrors());
    // eslint-disable-next-line security/detect-non-literal-fs-filename
    const contents = await fs.readFile(path.join(test.context.buildDirectory, 'lambda_service.js'), 'utf8');
    test.is(/sourceMappingURL=/.test(contents), expectMappingUrl, 'Has a souceMapping URL');
    test.is(/Available options are {auto, browser, node}/.test(contents), expectSourceMapRegister, 'Has source-map/register code');
  } finally {
    process.chdir(cwd);
  }
}

test.serial('allow enabling sourcemaps at runtime', async (test) => {
  await assertSourceMapBehavior(test, { enableRuntimeSourceMaps: true }, true, true);
});

test.serial('disables sourcemaps at runtime by default', async (test) => {
  await assertSourceMapBehavior(test, {}, false, false);
});

test.serial('Should handle building entrypoint outside of current working directory', async (test) => {
  const cwd = process.cwd();

  try {
    process.chdir(path.join(__dirname, '../src'));
    const buildResults = await build({
      outputPath: test.context.buildDirectory,
      entrypoint: path.join(FIXTURES_DIRECTORY, 'lambda_service.js'),
      serviceName: 'test-service',
      zip: true
    });
    test.false(buildResults.hasErrors());
  } finally {
    process.chdir(cwd);
  }
});

for (const nodeVersion of SUPPORTED_NODE_VERSIONS) {
  // Test that a common pattern can be packed without a regression
  test.serial(`Can webpack files that use await inside for...of statements targetting ${nodeVersion}`, async (test) => {
    const source = path.join(FIXTURES_DIRECTORY, 'async_test.js');

    const result = await build({
      nodeVersion,
      entrypoint: source,
      outputPath: test.context.buildDirectory,
      serviceName: 'test-service'
    });
    test.false(result.hasErrors());
  });

  test.serial(`Can webpack files that use arrow functions inside async functions when targetting ${nodeVersion}`, async (test) => {
    const source = path.join(FIXTURES_DIRECTORY, 'async_with_arrow.js');

    const result = await build({
      nodeVersion,
      entrypoint: source,
      outputPath: test.context.buildDirectory,
      serviceName: 'test-service'
    });
    test.false(result.hasErrors());

    // Try loading the newly loaded file to make sure it can
    // execute without an error
    let image = `lambci/lambda:nodejs${nodeVersion}`;
    if (nodeVersion.startsWith('10')) {
      image = 'lambci/lambda:nodejs10.x';
    } else if (nodeVersion.startsWith('12')) {
      image = 'lambci/lambda:nodejs12.x';
    }
    const executionEnvironment = await createLambdaExecutionEnvironment({
      image,
      mountpoint: test.context.buildDirectory
    });
    try {
      const runner = new LambdaRunner(executionEnvironment.container.id, null, 'async_with_arrow.handle');
      const result = await runner.invoke({});
      test.deepEqual(result, {});
    } finally {
      await destroyLambdaExecutionEnvironment(executionEnvironment);
    }
  });

  // Test that EJS modules can be packed because they are used by graphql
  test.serial(`Can webpack modules that use .mjs modules when targetting ${nodeVersion}`, async (test) => {
    const source = path.join(FIXTURES_DIRECTORY, 'es_modules/index.js');

    const result = await build({
      nodeVersion,
      entrypoint: source,
      outputPath: test.context.buildDirectory,
      serviceName: 'test-service'
    });

    test.false(result.hasErrors());
  });
}

async function assertMinification (test, options, expectMinification) {
  const source = path.join(FIXTURES_DIRECTORY, 'async_test.js');
  const bundle = path.join(test.context.buildDirectory, 'async_test.js');

  const buildResults = await build({
    entrypoint: source,
    outputPath: test.context.buildDirectory,
    serviceName: 'test-service',
    ...options
  });
  test.false(buildResults.hasErrors());

  // eslint-disable-next-line security/detect-non-literal-fs-filename
  const contents = await fs.readFile(bundle, 'utf8');
  test.is(/handler\(entry\)/.test(contents), !expectMinification);
}

test('Minification can be enabled', async (test) => {
  await assertMinification(test, { minify: true }, true);
});

test('Minification is disabled by default', async (test) => {
  await assertMinification(test, {}, false);
});
