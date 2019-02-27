const Docker = require('dockerode');
const {ensureImage} = require('../../src/docker');
const DEFAULT_IMAGE = 'alpine:3.6';

async function createDefaultContainer () {
  const docker = new Docker();
  await ensureImage(docker, DEFAULT_IMAGE);

  return docker.createContainer({
    Entrypoint: 'sh',
    HostConfig: {
      AutoRemove: true,
      NetworkMode: 'host',
      UsernsMode: 'host'
    },
    Image: DEFAULT_IMAGE,
    OpenStdin: true
  });
}

module.exports = {
  createDefaultContainer
};
