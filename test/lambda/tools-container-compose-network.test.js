const Docker = require('dockerode');
const sinon = require('sinon');
const test = require('ava');
const { v4: uuid } = require('uuid');

const { useNewContainer, useLambda } = require('../../src/lambda');
const { FIXTURES_DIRECTORY } = require('../helpers/lambda');

const prefix = process.env.COMPOSE_PROJECT_NAME = uuid();
const networkName = `${prefix}_default`;

test.serial.before(async t => {
  const docker = new Docker();

  const createContainer = sinon.spy(Docker.prototype, 'createContainer');

  const network = await docker.createNetwork({
    Internal: true,
    Name: networkName
  });
  Object.assign(t.context, {
    createContainer,
    network
  });
});

useLambda(test);

useNewContainer({
  handler: 'bundled_service.handler',
  mountpoint: FIXTURES_DIRECTORY,
  useComposeNetwork: true
});

test.serial.after.always(async (test) => {
  const { createContainer, network } = test;
  if (createContainer) {
    createContainer.restore();
  }
  if (network) {
    await network.remove();
  }
});

test('Managed containers can use a compose network', async (test) => {
  const { createContainer } = test.context;
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
