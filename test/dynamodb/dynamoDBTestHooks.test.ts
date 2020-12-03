import test from 'ava';
import { v4 as uuid } from 'uuid';
import { DynamoDB } from 'aws-sdk';

import { dynamoDBTestHooks, tableSchema } from '../../src/dynamodb';

function createTableSchema(): DynamoDB.CreateTableInput {
  const AttributeName = uuid();
  return {
    TableName: uuid(),
    AttributeDefinitions: [{
      AttributeName,
      AttributeType: 'S',
    }],
    KeySchema: [{
      AttributeName,
      KeyType: 'HASH',
    }],
    ProvisionedThroughput: {
      WriteCapacityUnits: 1,
      ReadCapacityUnits: 1,
    }
  };
}

test('can define tables in config', async t => {
  const badSchema = createTableSchema();
  const expectedSchema = createTableSchema();
  tableSchema([badSchema]);
  const { beforeAll, afterEach, beforeEach, afterAll } = dynamoDBTestHooks<['testTable']>(false, {
    tableSchemas: [expectedSchema]
  });
  await beforeAll();
  let context;
  try {
    context = await beforeEach();
    try {
      const {TableNames} = await context.dynamoClient.listTables().promise();
      t.deepEqual(TableNames, [expectedSchema.TableName]);
    } finally {
      await afterEach(context);
    }
  } finally {
    await afterAll();
  }


});
