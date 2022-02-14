const AWS = require('aws-sdk');
const test = require('ava');

const { tableSchema, useDynamoDB } = require('../../src/dynamodb');

useDynamoDB(test);

test.before(() => {
  tableSchema([
    {
      AttributeDefinitions: [
        {
          AttributeName: 'id',
          AttributeType: 'S',
        },
      ],
      KeySchema: [
        {
          AttributeName: 'id',
          KeyType: 'HASH',
        },
      ],
      ProvisionedThroughput: {
        ReadCapacityUnits: 1,
        WriteCapacityUnits: 1,
      },
      TableName: 'test-table',
    },
  ]);
});

test.after(() => {
  tableSchema([]);
});

// no uuid in table name (old way, basic regression test to ensure forward
// compatibility)
test.serial('The helper provides database clients and tables', async (test) => {
  const { dynamoClient, documentClient } = test.context.dynamodb;
  test.true(dynamoClient instanceof AWS.DynamoDB);
  test.true(documentClient instanceof AWS.DynamoDB.DocumentClient);

  const tables = await dynamoClient.listTables().promise();
  const tableName = 'test-table'; // no uuid/table name lookup
  test.true(tables.TableNames.includes(tableName));

  const item = {
    id: 'test',
    message: 'hello',
  };

  await documentClient.put({
    Item: item,
    TableName: tableName,
  }).promise();

  const result = await documentClient.get({
    Key: { id: 'test' },
    TableName: tableName,
  }).promise();

  test.deepEqual(result.Item, item);
});

test.serial('The helper does not include a unique identifier in the table names', (test) => {
  const { tableNames, uniqueIdentifier } = test.context.dynamodb;
  const tableName = tableNames['test-table'];

  test.true(typeof uniqueIdentifier === 'string');
  test.true(uniqueIdentifier.length === 0);
  test.is(tableName, 'test-table');
});
