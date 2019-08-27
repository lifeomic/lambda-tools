const Docker = require('dockerode');
const sinon = require('sinon');
const test = require('ava');
const uuid = require('uuid/v4');

const { useNewContainer, useLambda } = require('../../src/lambda');
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

useLambda(test);

useNewContainer({
  handler: 'bundled_service.handler',
  mountpoint: FIXTURES_DIRECTORY,
  useComposeNetwork: true
});

test.serial.after.always((test) => {
  createContainer.restore();
  network.remove();
});

test('Managed containers can use a compose network', async (test) => {
  const response = await test.context.lambda.get('/');
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
