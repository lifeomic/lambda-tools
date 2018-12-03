const test = require('ava');
const sinon = require('sinon');
const Docker = require('dockerode');
const path = require('path');
const lambda = require('../src/lambda');
const assert = require('assert');

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

  await test.throws(create, error.message);

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
