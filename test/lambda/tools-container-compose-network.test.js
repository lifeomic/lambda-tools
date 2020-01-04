const Docker = require('dockerode');
const sinon = require('sinon');
const test = require('ava');
const uuid = require('uuid/v4');

const { createLambdaExecutionEnvironment, AlphaClient, destroyLambdaExecutionEnvironment } = require('../../src/lambda');
const { FIXTURES_DIRECTORY } = require('../helpers/lambda');

const prefix = process.env.COMPOSE_PROJECT_NAME = uuid();
const networkName = `${prefix}_default`;

let createContainer = null;
let network = null;

test.before(async (test) => {
  const docker = new Docker();

  createContainer = sinon.spy(Docker.prototype, 'createContainer');

  network = await docker.createNetwork({
    Internal: true,
    Name: networkName
  });
});

test.serial.after.always(async test => {
  if (test.context.executionEnvironment) {
    await destroyLambdaExecutionEnvironment(test.context.executionEnvironment);
  }
  createContainer.restore();
  network.remove();
});

test('Managed containers can use a compose network', async (test) => {
  const handler = 'bundled_service.handler';
  const executionEnvironment = await createLambdaExecutionEnvironment({
    handler,
    mountpoint: FIXTURES_DIRECTORY,
    network: networkName
  });

  test.context.executionEnvironment = executionEnvironment;

  const lambda = new AlphaClient({
    container: executionEnvironment.container,
    handler
  });

  const response = await lambda.get('/');
  test.is(response.status, 200);
  test.is(response.data.service, 'lambda-test');

  sinon.assert.calledWithExactly(
    createContainer,
    sinon.match({
      HostConfig: sinon.match({
        NetworkMode: networkName
      })
    })
  );
});
