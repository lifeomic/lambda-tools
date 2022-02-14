const path = require('path');
const test = require('ava');
const fs = require('fs-extra');
const { v4: uuid } = require('uuid');

const { build, useComposeContainer, useLambda } = require('../../src/lambda');
const { createContainer, FIXTURES_DIRECTORY } = require('../helpers/lambda');

const LAMBDA_IMAGE = 'lambci/lambda:nodejs12.x';

const buildDirectory = path.join(FIXTURES_DIRECTORY, 'build', uuid());
let container = null;

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

test('The helper client can invoke graphql lambda services', async (test) => {
  const config = {
    headers: { 'test-header': 'test value' },
  };

  const query = `
    query TestQuery ($prompt: String!) {
      value(prompt: $prompt)
    }
  `;

  const variables = {
    prompt: 'value',
  };

  const response = await test.context.lambda.graphql('/', query, variables, config);
  test.is(response.status, 200);
  test.is(response.data.data.value, 'value: test value');
});
