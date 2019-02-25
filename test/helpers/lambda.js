const Docker = require('dockerode');
const fs = require('fs-extra');
const path = require('path');
const uuid = require('uuid/v4');

const { build, useComposeContainer, useLambda } = require('../../src/lambda');
const { promisify } = require('util');

const FIXTURES_DIRECTORY = path.join(__dirname, '..', 'fixtures');

function hasTag (tagName) {
  return function (image) {
    return image.RepoTags && image.RepoTags.includes(tagName);
  };
}

function useLambdaContainer (test, imageName, options = {}) {
  const bundlePath = path.join(FIXTURES_DIRECTORY, 'build', uuid());
  const { containerConfig = {} } = options;
  let container;

  useLambda(test);

  test.before(async () => {
    const buildResults = await build({
      entrypoint: path.join(FIXTURES_DIRECTORY, 'lambda_service.js'),
      outputPath: bundlePath,
      serviceName: 'test-service'
    });

    if (buildResults.hasErrors()) {
      console.error(buildResults.toJson().errors);
      throw new Error('Lambda build failed!');
    }

    imageName = typeof imageName === 'string' ? imageName : await imageName();

    const containerName = 'container';
    const containerPrefix = process.env.COMPOSE_PROJECT_NAME = uuid();
    container = await createContainer(imageName, `${containerPrefix}_${containerName}_1`, bundlePath);
    useComposeContainer({ ...containerConfig, service: containerName, handler: 'lambda_service.handler' });
  });

  test.beforeEach(function (t) {
    t.context.container = container;
  });

  test.after.always(async () => {
    delete process.env.COMPOSE_PROJECT_NAME;
    await fs.remove(bundlePath);

    // Ensure that the container is always stopped
    try {
      await container.stop();
    } catch (error) {
      // swallow errors...
    }
  });
}

async function createContainer (image, name, mountpoint) {
  const docker = new Docker();
  const followProgress = promisify(docker.modem.followProgress);

  const qualifiedImage = /:[^:]*/.test(image) ? image : `${image}:latest`;

  const images = await docker.listImages();
  if (!images.find(hasTag(qualifiedImage))) {
    await followProgress(await docker.pull(image));
  }

  const container = await docker.createContainer({
    Entrypoint: '/bin/sh',
    HostConfig: {
      AutoRemove: true,
      Binds: [
        `${mountpoint}:/var/task`
      ]
    },
    Image: image,
    name,
    OpenStdin: true,
    Volumes: {
      '/var/task': {}
    }
  });

  await container.start();
  return container;
}

module.exports = {
  createContainer,
  useLambdaContainer
};
