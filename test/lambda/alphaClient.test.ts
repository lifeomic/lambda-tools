import path from 'path';
import anyTest, { TestInterface } from 'ava';
import fs from 'fs-extra';
import { v4 as uuid } from 'uuid';
import { Container } from 'dockerode';

import { build, LambdaTestContext, useComposeContainer, useLambda } from '../../src/lambda';
import { createContainer, FIXTURES_DIRECTORY } from '../helpers/lambda';

const LAMBDA_IMAGE = 'lambci/lambda:nodejs12.x';

const buildDirectory = path.join(FIXTURES_DIRECTORY, 'build', uuid());
let container: Container | undefined;

const test = anyTest as TestInterface<LambdaTestContext>;

useLambda(test);

test.before(async () => {
  const buildResults = await build({
    entrypoint: path.join(FIXTURES_DIRECTORY, 'lambda_graphql.js'),
    outputPath: buildDirectory,
  });

  if (buildResults.hasErrors()) {
    console.error(buildResults.toJson().errors);
    throw new Error('Lambda build failed!');
  }

  const containerName = 'container';
  const containerPrefix = process.env.COMPOSE_PROJECT_NAME = uuid();
  container = await createContainer(LAMBDA_IMAGE, `${containerPrefix}_${containerName}_1`, buildDirectory);
  useComposeContainer({ service: containerName, handler: 'lambda_graphql.handler' });
});

test.after.always(async () => {
  delete process.env.COMPOSE_PROJECT_NAME;
  await fs.remove(buildDirectory);
  try {
    if (container) {
      await container.stop();
      console.log(`Stopped container ${container.id}`);
    }
  } catch (error) {
    console.error(error);
  }
});

test('will throw error if now callback', async (t) => {
  const { lambda } = t.context;
  const recursiveEvent: Record<string, any> = {};
  recursiveEvent.recursiveEvent = recursiveEvent;
  // @ts-expect-error
  await t.throwsAsync(lambda.raw(recursiveEvent));
});
