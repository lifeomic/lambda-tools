const Docker = require('dockerode');
const path = require('path');
const test = require('ava');
const uuid = require('uuid/v4');

const { promisify } = require('util');
const { useLambdaContainer, FIXTURES_DIRECTORY } = require('../helpers/lambda');

async function buildDerivativeImage () {
  const docker = new Docker();
  const followProgress = promisify(docker.modem.followProgress);
  const name = `lambci-derivative-${uuid()}`;

  await followProgress(
    await docker.buildImage(
      {
        context: path.join(FIXTURES_DIRECTORY, 'lambci-derivative'),
        src: [ 'Dockerfile' ]
      },
      { t: name }
    )
  );

  return name;
}

useLambdaContainer(test, buildDerivativeImage);

test('The helper client can invoke lambdaci derivative containers', async (test) => {
  const response = await test.context.lambda.get('/');
  test.is(response.status, 200);
  test.is(response.data.service, 'lambda-test');
});
