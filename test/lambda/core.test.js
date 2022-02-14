const test = require('ava');
const { v4: uuid } = require('uuid');
const { destroyLambdaExecutionEnvironment, useNewContainer, getGlobalOptions } = require('../../src/lambda');

test('will not crash if no execution environment is provided', async (test) => {
  await test.notThrowsAsync(destroyLambdaExecutionEnvironment());
});

test('will not create a network id when not useComposeNetwork', (t) => {
  process.env.COMPOSE_PROJECT_NAME = uuid();
  useNewContainer({ });
  const options = getGlobalOptions();
  t.is(options.network, undefined);
});

test('will create a network id for the compose network', (t) => {
  const composeProjectName = uuid();
  process.env.COMPOSE_PROJECT_NAME = composeProjectName;
  useNewContainer({ useComposeNetwork: true });
  const options = getGlobalOptions();
  t.is(options.network, `${composeProjectName}_default`);
});
