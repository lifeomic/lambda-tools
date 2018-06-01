const test = require('ava');

const { useDynamoDB } = require('@lifeomic/lambda-tools').dynamodb;
const { useLambda } = require('@lifeomic/lambda-tools').lambda;

useDynamoDB(test);
useLambda(test);

test.serial('The Lambda function can use the Dynamo instance', async (test) => {
  const tables = await test.context.lambda.raw(null, null);
  test.deepEqual(tables, [ 'testers' ]);
});
