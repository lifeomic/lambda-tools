const test = require('ava');
const AWS = require('aws-sdk');
const sinon = require('sinon');

const { tableSchema, getConnection, createTables, destroyTables } = require('../src/dynamodb');

function throwTestError () {
  throw new Error('test');
}

test.before(() => {
  tableSchema([
    {
      TableName: 'test-table',
      AttributeDefinitions: [
        {
          AttributeName: 'hashKey',
          AttributeType: 'S'
        },
        {
          AttributeName: 'rangeKey',
          AttributeType: 'S'
        },
        {
          AttributeName: 'gsiHashKey',
          AttributeType: 'S'
        },
        {
          AttributeName: 'lsiRangeKey',
          AttributeType: 'S'
        }
      ],
      KeySchema: [
        {
          AttributeName: 'hashKey',
          KeyType: 'HASH'
        },
        {
          AttributeName: 'rangeKey',
          KeyType: 'RANGE'
        }
      ],
      ProvisionedThroughput: {
        ReadCapacityUnits: 10,
        WriteCapacityUnits: 10
      },
      GlobalSecondaryIndexes: [
        {
          IndexName: 'test-gsi',
          KeySchema: [
            {
              AttributeName: 'gsiHashKey',
              KeyType: 'HASH'
            },
            {
              AttributeName: 'rangeKey',
              KeyType: 'RANGE'
            }
          ],
          ProvisionedThroughput: {
            ReadCapacityUnits: 10,
            WriteCapacityUnits: 10
          },
          Projection: {
            ProjectionType: 'ALL'
          }
        }
      ],
      LocalSecondaryIndexes: [
        {
          IndexName: 'example-lsi',
          KeySchema: [
            {
              AttributeName: 'hashKey',
              KeyType: 'HASH'
            },
            {
              AttributeName: 'lsiRangeKey',
              KeyType: 'RANGE'
            }
          ],
          Projection: {
            ProjectionType: 'ALL'
          }
        }
      ]
    }
  ]);
});

test.after(() => {
  tableSchema([]);
});

async function assertTablesPresent (t, client, expected, message) {
  const tables = await client.listTables().promise();
  t.deepEqual(
    tables.TableNames,
    expected,
    message
  );
}

test.serial('createTables creates tables according to specified schemas', async (t) => {
  const { connection, config } = await getConnection();

  try {
    const client = new AWS.DynamoDB(config);
    await createTables(client);
    await assertTablesPresent(
      t,
      client,
      ['test-table'],
      'createTables should have added "test-table"'
    );
  } finally {
    await connection.cleanup();
  }
});

test.serial('throws when createTables fails', async t => {
  const { connection, config } = await getConnection();

  try {
    const client = new AWS.DynamoDB(config);
    sinon.stub(client, 'createTable').onFirstCall().callsFake(throwTestError);
    const { message } = await t.throwsAsync(createTables(client));
    t.is(message, 'Failed to create tables: test-table');
  } finally {
    await connection.cleanup();
  }
});

test.serial('throws when destroyTables fails', async t => {
  const { connection, config } = await getConnection();

  try {
    const client = new AWS.DynamoDB(config);
    sinon.stub(client, 'listTables').onFirstCall().returns({
      promise: () => Promise.resolve({
        TableNames: ['test-table']
      })
    });
    sinon.stub(client, 'deleteTable').onFirstCall().callsFake(throwTestError);
    const { message } = await t.throwsAsync(destroyTables(client));
    t.is(message, 'Failed to destroy tables: test-table');
  } finally {
    await connection.cleanup();
  }
});

test.serial('destroyTables destroys created tables', async t => {
  const { connection, config } = await getConnection();

  try {
    const client = new AWS.DynamoDB(config);
    await createTables(client);

    await assertTablesPresent(
      t,
      client,
      ['test-table'],
      'createTables should have added "test-table"'
    );

    await destroyTables(client);
    await assertTablesPresent(
      t,
      client,
      [],
      'destroyTables should have destroyed "test-table"'
    );
  } finally {
    await connection.cleanup();
  }
});
