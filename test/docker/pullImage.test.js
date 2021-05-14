const test = require('ava');
const Docker = require('dockerode');
const sinon = require('sinon');
const { getLogger } = require('../../src/utils/logging');

const { pullImage, imageExists } = require('../../src/docker');
const TEST_IMAGE = 'alpine:3.5';

test.beforeEach(t => {
  const logger = getLogger('docker');

  Object.assign(t.context, { logger });
});

test.afterEach(t => {
  const { logger } = t.context;
  if (logger.debug.restore) {
    logger.debug.restore();
  }
});

test.serial('will debug the progress of pulling an image', async (test) => {
  const { logger } = test.context;
  const logSpy = sinon.spy(logger, 'debug');

  const docker = new Docker();
  if (await imageExists(docker, TEST_IMAGE)) {
    const image = await docker.getImage(TEST_IMAGE);
    await image.remove();
  }

  await pullImage(docker, TEST_IMAGE);
  sinon.assert.called(logSpy);
  sinon.assert.calledWithExactly(logSpy, `${TEST_IMAGE}: Status: Downloaded newer image for ${TEST_IMAGE} `);
});

test.serial('will debug the progress of pulling an image from docker hub', async (test) => {
  process.env.DOCKER_HUB_USER = 'docker_user';
  process.env.DOCKER_HUB_PASS = 'docker_pass';
  try {
    const { logger } = test.context;
    const logSpy = sinon.spy(logger, 'debug');

    const docker = new Docker();
    if (await imageExists(docker, TEST_IMAGE)) {
      const image = await docker.getImage(TEST_IMAGE);
      await image.remove();
    }

    await pullImage(docker, TEST_IMAGE);
    sinon.assert.called(logSpy);
    sinon.assert.calledWithExactly(logSpy, `${TEST_IMAGE}: Status: Downloaded newer image for ${TEST_IMAGE} `);
    sinon.assert.calledWithExactly(docker.pull, TEST_IMAGE, {
      username: 'docker_user',
      password: 'docker_pass'
    });
  } finally {
    delete process.env.DOCKER_HUB_USER;
    delete process.env.DOCKER_HUB_PASS;
  }
});
