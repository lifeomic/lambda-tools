const test = require('ava');
const { destroyLambdaExecutionEnvironment } = require('../../src/lambda');

test('will not crash if no execution environment is provided', async test => {
  await test.notThrowsAsync(destroyLambdaExecutionEnvironment());
});
