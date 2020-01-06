const test = require('ava');
const Docker = require('dockerode');
const sinon = require('sinon');
const proxyquire = require('proxyquire');

const TEST_IMAGE = 'alpine:3.5';

test.afterEach(t => {
  if (console.log.restore) {
    console.log.restore();
  }
});

test.serial('can log the progress of pulling an image', async (test) => {
  const logSpy = sinon.spy(console, 'log');

  process.env.DEBUG_DOCKER = 'true';
  const { pullImage, imageExists } = proxyquire.noPreserveCache()('../../src/docker', {});

  const docker = new Docker();
  if (await imageExists(docker, TEST_IMAGE)) {
    const image = await docker.getImage(TEST_IMAGE);
    await image.remove();
  }

  await pullImage(docker, TEST_IMAGE);
  sinon.assert.called(logSpy);
  sinon.assert.calledWith(logSpy, sinon.match(new RegExp(`${TEST_IMAGE}: Status: Downloaded newer image for ${TEST_IMAGE}`)));
});
