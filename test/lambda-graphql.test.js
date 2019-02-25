const path = require('path');
const test = require('ava');
const uuid = require('uuid/v4');

const { build, useComposeContainer, useLambda } = require('../src/lambda');
const { createContainer } = require('./helpers/lambda');

const LAMBDA_IMAGE = 'lambci/lambda:nodejs6.10';

const buildDirectory = path.join(__dirname, 'fixtures', 'build', uuid());
let container = null;

useLambda(test);

test.before(async () => {
  const buildResults = await build({
    entrypoint: path.join(__dirname, 'fixtures', 'lambda_graphql.js'),
    outputPath: buildDirectory
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
  try {
    container.stop();
  } catch (error) {
    // swallow errors...
  }
});

test('The helper client can invoke graphql lambda services', async (test) => {
  const config = {
    headers: { 'test-header': 'test value' }
  };

  const query = `
    query TestQuery ($prompt: String!) {
      value(prompt: $prompt)
    }
  `;

  const variables = {
    prompt: 'value'
  };

  const response = await test.context.lambda.graphql('/', query, variables, config);
  test.is(response.status, 200);
  test.is(response.data.data.value, 'value: test value');
});
