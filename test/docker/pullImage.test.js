const test = require('ava');
const Docker = require('dockerode');
const sinon = require('sinon');
const { v4: uuid } = require('uuid');
const { getLogger } = require('../../src/utils/logging');
const { PassThrough } = require('stream');

const { pullImage } = require('../../src/docker');
const TEST_IMAGE = 'alpine:3.5';

const logger = getLogger('docker');

test.beforeEach((t) => {
  const debugSpy = sinon.spy(logger, 'debug');
  const docker = new Docker();
  const dockerPull = sinon.stub(docker, 'pull');

  const stream = new PassThrough();
  dockerPull.resolves(stream);
  const messages = [
    { status: `Status: Downloading ${TEST_IMAGE}`, progress: '======>' },
    { status: `Status: Downloaded newer image for ${TEST_IMAGE}` },
  ];

  messages.forEach((message) => `${JSON.stringify(message)}\n`);
  stream.end();

  Object.assign(t.context, { debugSpy, docker, dockerPull, messages });
});

test.afterEach((t) => {
  const { debugSpy } = t.context;
  debugSpy.restore();

  delete process.env.DOCKER_HUB_USER;
  delete process.env.DOCKER_HUB_PASS;
});

const validateDebugLogs = (logSpy, messages) => {
  sinon.assert.called(logSpy);
  messages.forEach((progress) => {
    sinon.assert.calledWithExactly(logSpy, `${TEST_IMAGE}: ${progress.status}${progress.progress ? ` ${progress.progress}` : ''}`);
  });
};

test.serial('will debug the progress of pulling an image', async (t) => {
  const { docker, debugSpy, dockerPull, messages } = t.context;

  await pullImage(docker, TEST_IMAGE);
  validateDebugLogs(debugSpy, messages);
  sinon.assert.calledWithExactly(dockerPull, TEST_IMAGE, { });
});
test.serial('will provide empty credentials if no docker env variables exist when pulling an image from docker hub', async (t) => {
  const { docker, debugSpy, dockerPull, messages } = t.context;

  await pullImage(docker, TEST_IMAGE);
  sinon.assert.called(debugSpy);
  sinon.assert.called(dockerPull);
  validateDebugLogs(debugSpy, messages);
  sinon.assert.calledWithExactly(debugSpy, 'Pulling image as anon');
  sinon.assert.calledWithExactly(dockerPull, TEST_IMAGE, { });
});

test.serial('will provide credentials from env variables when pulling an image from docker hub', async (t) => {
  process.env.DOCKER_HUB_USER = 'docker_user';
  process.env.DOCKER_HUB_PASS = 'docker_pass';
  const { docker, debugSpy, dockerPull, messages } = t.context;

  await pullImage(docker, TEST_IMAGE);
  sinon.assert.called(debugSpy);
  sinon.assert.called(dockerPull);
  validateDebugLogs(debugSpy, messages);
  sinon.assert.calledWithExactly(debugSpy, 'Pulling image as docker_user');
  sinon.assert.calledWithExactly(dockerPull, TEST_IMAGE, {
    authconfig: {
      username: 'docker_user',
      password: 'docker_pass',
    },
  });
});

test.serial('will log and throw errors', async (t) => {
  const { docker, dockerPull } = t.context;
  const errorSpy = sinon.spy(logger, 'error');
  const progressError = uuid();
  const error = `${TEST_IMAGE}: Error: ${progressError}`;
  const stream = new PassThrough();
  dockerPull.resolves(stream);
  stream.push(`${JSON.stringify({ error: progressError })}\n`);
  stream.end();

  await t.throwsAsync(pullImage(docker, TEST_IMAGE), { message: error });
  sinon.assert.called(errorSpy);
  sinon.assert.calledWithExactly(errorSpy, error);
  sinon.assert.calledWithExactly(dockerPull, TEST_IMAGE, { });
});
