const test = require('ava');
const sinon = require('sinon');
const Docker = require('dockerode');
const path = require('path');
const lambda = require('../src/lambda');

test('Cleanups up the network and container on failure after start', async function (test) {
  const error = new Error('Failure to start');
  const originalStart = Docker.Container.prototype.start;
  sinon.stub(Docker.Container.prototype, 'start').callsFake(async function () {
    await originalStart.call(this, arguments);
    throw error;
  });
  const containerStopSpy = sinon.spy(Docker.Container.prototype, 'stop');
  const networkRemoveSpy = sinon.spy(Docker.Network.prototype, 'remove');

  const create = lambda.createLambdaExecutionEnvironment({
    mountpoint: path.join(__dirname, 'fixtures', 'build')
  });

  await test.throws(create, error.message);

  sinon.assert.calledOnce(containerStopSpy);
  sinon.assert.calledOnce(networkRemoveSpy);
});
