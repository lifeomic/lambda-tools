const test = require('ava');
const sinon = require('sinon');
const Docker = require('dockerode');
const path = require('path');
const lambda = require('../src/lambda');
const assert = require('assert');
const fs = require('fs-extra');
const tmp = require('tmp-promise');

test.beforeEach((test) => {
  test.context.sandbox = sinon.createSandbox();
});
test.afterEach((test) => {
  test.context.sandbox.restore();
});

test.serial('Cleanups up the network and container on failure after start', async function (test) {
  const error = new Error('Failure to start');
  const originalStart = Docker.Container.prototype.start;
  test.context.sandbox.stub(Docker.Container.prototype, 'start').callsFake(async function () {
    await originalStart.call(this, arguments);
    throw error;
  });
  const containerStopSpy = test.context.sandbox.spy(Docker.Container.prototype, 'stop');
  const networkRemoveSpy = test.context.sandbox.spy(Docker.Network.prototype, 'remove');

  const create = lambda.createLambdaExecutionEnvironment({
    mountpoint: path.join(__dirname, 'fixtures', 'build')
  });

  await test.throwsAsync(() => create, error.message);

  sinon.assert.calledOnce(containerStopSpy);
  sinon.assert.calledOnce(networkRemoveSpy);
});

test.serial('Sends AWS_XRAY_CONTEXT_MISSING var to createContainer with no value when it is null (removing env vars)', async function (test) {
  const createSpy = test.context.sandbox.spy(Docker.prototype, 'createContainer');

  await lambda.createLambdaExecutionEnvironment({
    environment: { AWS_XRAY_CONTEXT_MISSING: null },
    mountpoint: path.join(__dirname, 'fixtures', 'build')
  });

  sinon.assert.calledWithMatch(createSpy, sinon.match((arg) => {
    assert.deepEqual(arg.Env, [ 'AWS_XRAY_CONTEXT_MISSING' ]);
    return true;
  }));
});

test.serial('Cleanups up temp directory when unzipping fails', async (test) => {
  test.context.sandbox.stub(fs, 'createReadStream').throws();
  const emptyDirSpy = test.context.sandbox.spy(fs, 'emptyDir');
  const tempDirSpy = test.context.sandbox.spy(tmp, 'dir');

  const failingCreate = lambda.createLambdaExecutionEnvironment({
    environment: { AWS_XRAY_CONTEXT_MISSING: null },
    zipfile: path.join(__dirname, 'fixtures', 'bundled_service.zip')
  });

  await test.throwsAsync(() => failingCreate);

  sinon.assert.calledOnce(tempDirSpy);

  const { path: tempDirPath } = await tempDirSpy.returnValues[0];
  sinon.assert.calledOnce(emptyDirSpy);
  sinon.assert.calledWithExactly(emptyDirSpy, tempDirPath);
});
