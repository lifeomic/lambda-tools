const AWS = require('aws-sdk');
const test = require('ava');

const { tableSchema, useDynamoDB } = require('../../src/dynamodb');

useDynamoDB(test, true);

test.before(() => {
  tableSchema([
    {
      AttributeDefinitions: [
        {
          AttributeName: 'id',
          AttributeType: 'S'
        }
      ],
      KeySchema: [
        {
          AttributeName: 'id',
          KeyType: 'HASH'
        }
      ],
      ProvisionedThroughput: {
        ReadCapacityUnits: 1,
        WriteCapacityUnits: 1
      },
      TableName: 'test-table'
    }
  ]);
});

test.after(() => {
  tableSchema([]);
});

test('The helper provides database clients and tables', async (test) => {
  const {tableNames, dynamoClient, documentClient} = test.context.dynamodb;
  test.true(dynamoClient instanceof AWS.DynamoDB);
  test.true(documentClient instanceof AWS.DynamoDB.DocumentClient);

  const tables = await dynamoClient.listTables().promise();
  const tableName = tableNames['test-table'];
  test.true(tables.TableNames.includes(tableName));

  const item = {
    id: 'test',
    message: 'hello'
  };

  await documentClient.put({
    Item: item,
    TableName: tableName
  }).promise();

  const result = await documentClient.get({
    Key: { id: 'test' },
    TableName: tableName
  }).promise();

  test.deepEqual(result.Item, item);
});

test('The helper includes a unique identifier in the table names', async (test) => {
  const {tableNames, uniqueIdentifier} = test.context.dynamodb;
  const tableName = tableNames['test-table'];

  test.true(typeof uniqueIdentifier === 'string');
  test.true(uniqueIdentifier.length > 0);
  test.is(tableName, `test-table-${uniqueIdentifier}`);
});

test('The helper sets default configuration environment variables', async (test) => {
  test.truthy(process.env.AWS_ACCESS_KEY_ID);
  test.truthy(process.env.AWS_SECRET_ACCESS_KEY);
  test.truthy(process.env.AWS_REGION);
  test.truthy(process.env.DYNAMODB_ENDPOINT);
});

test('The helper provides a config object', async (test) => {
  const {config} = test.context.dynamodb;

  test.true(config.credentials instanceof AWS.Credentials);
  test.true(config.endpoint instanceof AWS.Endpoint);
  test.truthy(config.region);
});
