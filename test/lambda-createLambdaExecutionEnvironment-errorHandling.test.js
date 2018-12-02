const test = require('ava');
const sinon = require('sinon');
const Docker = require('dockerode');
const path = require('path');
const lambda = require('../src/lambda');
const assert = require('assert');

let sandbox;
test.beforeEach(() => {
  sandbox = sinon.createSandbox();
});
test.afterEach(() => {
  sandbox.restore();
});

test.serial('Cleanups up the network and container on failure after start', async function (test) {
  const error = new Error('Failure to start');
  const originalStart = Docker.Container.prototype.start;
  sandbox.stub(Docker.Container.prototype, 'start').callsFake(async function () {
    await originalStart.call(this, arguments);
    throw error;
  });
  const containerStopSpy = sandbox.spy(Docker.Container.prototype, 'stop');
  const networkRemoveSpy = sandbox.spy(Docker.Network.prototype, 'remove');

  const create = lambda.createLambdaExecutionEnvironment({
    mountpoint: path.join(__dirname, 'fixtures', 'build')
  });

  await test.throws(create, error.message);

  sinon.assert.calledOnce(containerStopSpy);
  sinon.assert.calledOnce(networkRemoveSpy);
});

test.serial('Sends AWS_XRAY_CONTEXT_MISSING var with no value when DISABLE_XRAY_LOGGING is set', async function (test) {
  const createSpy = sandbox.spy(Docker.prototype, 'createContainer');

  await lambda.createLambdaExecutionEnvironment({
    environment: {DISABLE_XRAY_LOGGING: true},
    mountpoint: path.join(__dirname, 'fixtures', 'build')
  });

  sinon.assert.calledWithMatch(createSpy, sinon.match((arg) => {
    assert.deepEqual(arg.Env, [ 'DISABLE_XRAY_LOGGING=true', 'AWS_XRAY_CONTEXT_MISSING' ]);
    return true;
  }));
});
