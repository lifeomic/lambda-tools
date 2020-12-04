const test = require('ava');
const Docker = require('dockerode');
const { ensureImage } = require('../../src/docker');
const sinon = require('sinon');

const TEST_IMAGE = 'alpine:3.6';

test.before(async function () {
  const docker = new Docker();
  await ensureImage(docker, TEST_IMAGE);
});

test('does not call pullImage if listImages includes the image already', async function (test) {
  // Create a Docker instance and watch the pull method
  const docker = new Docker();
  sinon.spy(docker, 'pull');

  // Call ensureImage on an image that is known to exist, because of the
  // beforeEach and make sure that pull is not called
  await ensureImage(docker, TEST_IMAGE);
  sinon.assert.notCalled(docker.pull);
});

function newImmediatelyEndingStream () {
  return {
    pipe: function (stream) {
      stream.emit('end');
    }
  };
}

test('calls pullImage if listImages does not include the image', async function (test) {
  // Create a Docker instance and watch the pull method
  const docker = new Docker();
  sinon.stub(docker, 'pull')
    .returns(newImmediatelyEndingStream());

  // Call ensureImage on an image that does not exist
  // make sure that pull is not called with that image name
  const IMAGE_NEEDING_PULL = 'needs-pull:latest';
  await ensureImage(docker, IMAGE_NEEDING_PULL);
  sinon.assert.calledWithExactly(docker.pull, IMAGE_NEEDING_PULL, {});
});
