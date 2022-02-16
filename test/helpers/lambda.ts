import { TestInterface } from 'ava';
import Docker, { Container } from 'dockerode';

import fs from 'fs-extra';
import path from 'path';
import { v4 as uuid } from 'uuid';
import { build, useComposeContainer, useLambda } from '../../src/lambda';
import { pullImage } from '../../src/docker';
import { Config } from '../../src/webpack';

export const FIXTURES_DIRECTORY = path.join(__dirname, '../fixtures');

export interface HelpersLambdaTestContext {
  container?: Container;
}

export const buildLambda = async (bundlePath: string, handlerName: string, options?: Partial<Config>) => {
  const buildResults = await build({
    entrypoint: path.join(FIXTURES_DIRECTORY, `${handlerName}`),
    outputPath: bundlePath,
    serviceName: `test-service-${handlerName}`,
    ...options,
  });

  if (buildResults.hasErrors()) {
    console.error(buildResults.toJson().errors);
    throw new Error('Lambda build failed!');
  }
  return buildResults;
};

export interface UseLambdaContainerOptions {
  containerConfig?: Record<string, any>;
  handlerName?: string;
}

export const useLambdaContainer = (test: TestInterface<HelpersLambdaTestContext>, imageName: string | (() => Promise<string>), options: UseLambdaContainerOptions = {}) => {
  const bundlePath = path.join(FIXTURES_DIRECTORY, 'build', uuid());
  const { containerConfig = {}, handlerName = 'lambda_service' } = options;
  let container: Container;

  useLambda(test);

  test.before(async () => {
    await buildLambda(bundlePath, `${handlerName}.js`);

    imageName = typeof imageName === 'string' ? imageName : await imageName();

    const containerName = 'container';
    const containerPrefix = process.env.COMPOSE_PROJECT_NAME = uuid();
    container = await createContainer(imageName, `${containerPrefix}_${containerName}_1`, bundlePath);
    useComposeContainer({ ...containerConfig, service: containerName, handler: `${handlerName}.handler` });
  });

  test.beforeEach((t) => {
    t.context.container = container;
  });

  test.after.always(async () => {
    delete process.env.COMPOSE_PROJECT_NAME;
    await fs.remove(bundlePath);

    // Ensure that the container is always stopped
    try {
      await container.stop();
    } catch (error) {
      console.warn(error);
      // swallow errors...
    }
  });
};

export const createContainer = async (image: string, name: string, mountpoint: string) => {
  const docker = new Docker();

  const qualifiedImage = /:[^:]*/.test(image) ? image : `${image}:latest`;
  await pullImage(docker, qualifiedImage);

  const container = await docker.createContainer({
    Entrypoint: '/bin/sh',
    HostConfig: {
      AutoRemove: true,
      Binds: [
        `${mountpoint}:/var/task`,
      ],
    },
    Image: image,
    name,
    OpenStdin: true,
    Volumes: {
      '/var/task': {},
    },
  });

  await container.start();
  console.log(`Created container ${container.id}`);
  return container;
};
