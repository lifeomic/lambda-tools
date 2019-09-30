const test = require('ava');
const AWS = require('aws-sdk');
const Docker = require('dockerode');
const sinon = require('sinon');
const uuid = require('uuid/v4');

const { tableSchema, getConnection, createTables, destroyTables, launchDynamoContainer } = require('../../src/dynamodb');

function throwTestError () {
  throw new Error('test');
}

const TEST_TABLE_SCHEMA = {
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
};

test.beforeEach(() => {
  tableSchema([
    TEST_TABLE_SCHEMA
  ]);
});

test.afterEach(() => {
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
    const deleteTable = sinon.spy(client, 'deleteTable');
    const { message } = await t.throwsAsync(createTables(client));
    t.is(message, 'Failed to create tables: test-table');
    sinon.assert.notCalled(deleteTable);
  } finally {
    await connection.cleanup();
  }
});

test.serial('deletes created tables when createTables fails', async t => {
  const { connection, config } = await getConnection();

  tableSchema([
    Object.assign({}, TEST_TABLE_SCHEMA, { TableName: 'test-table-not-created' }),
    Object.assign({}, TEST_TABLE_SCHEMA, { TableName: 'test-table-created' })
  ]);

  try {
    const client = new AWS.DynamoDB(config);
    sinon.stub(client, 'createTable')
      .callThrough()
      .onFirstCall().callsFake(throwTestError);
    const deleteTable = sinon.spy(client, 'deleteTable');

    const { message } = await t.throwsAsync(createTables(client));
    t.is(message, 'Failed to create tables: test-table-not-created');
    const { TableNames } = await client.listTables().promise();
    t.deepEqual(TableNames, []);
    sinon.assert.calledOnce(deleteTable);
    sinon.assert.calledWithExactly(deleteTable, { TableName: 'test-table-created' });
  } finally {
    await connection.cleanup();
  }
});

test.serial('throws when createTables fails, logs if destory fails', async t => {
  const { connection, config } = await getConnection();

  const TableName = 'test-table-2';

  tableSchema([
    Object.assign({}, TEST_TABLE_SCHEMA, { TableName }),
    TEST_TABLE_SCHEMA
  ]);

  try {
    const client = new AWS.DynamoDB(config);
    sinon.stub(client, 'createTable')
      .callThrough()
      .onSecondCall().callsFake(throwTestError);
    const deleteTable = sinon.stub(client, 'deleteTable')
      .onFirstCall().callsFake(throwTestError);

    const { message } = await t.throwsAsync(createTables(client));
    t.is(message, 'Failed to create tables: test-table');
    sinon.assert.calledOnce(deleteTable);
    sinon.assert.calledWithExactly(deleteTable, { TableName });
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

async function destroyTableTest (t, useUniqueTables) {
  const { connection, config } = await getConnection();
  const uniqueIdentifier = useUniqueTables ? uuid() : '';
  const tableName = useUniqueTables
    ? `test-table-${uniqueIdentifier}` : 'test-table';

  try {
    const client = new AWS.DynamoDB(config);
    await createTables(client, uniqueIdentifier);

    await assertTablesPresent(
      t,
      client,
      [tableName],
      `createTables should have added "${tableName}"`
    );

    await destroyTables(client, uniqueIdentifier);
    await assertTablesPresent(
      t,
      client,
      [],
      `destroyTables should have destroyed "${tableName}"`
    );
  } finally {
    await connection.cleanup();
  }
}

test.serial('destroyTables destroys created tables', async t => {
  await destroyTableTest(t, false);
});

test.serial('destroyTables destroys created tables when uniqueIdentifier is used', async t => {
  await destroyTableTest(t, true);
});

test('Setting inMemory to true runs the container in in-memory mode', async t => {
  const docker = sinon.stub(new Docker());
  docker.listImages.returns([{ RepoTags: ['cnadiminti/dynamodb-local:latest'] }]);
  const container = sinon.stub({ start: () => null, inspect: () => null });
  container.start.returns(Promise.resolve(null));
  container.inspect.returns({
    NetworkSettings: {
      Ports: {
        '8000/tcp': [
          { HostPort: 1337 }
        ]
      }
    }
  });
  docker.createContainer.returns(container);
  await launchDynamoContainer({ docker, inMemory: true });
  sinon.assert.calledWith(docker.createContainer, sinon.match({ Cmd: ['-inMemory', '-sharedDb'] }));
});

test('Setting inMemory to false runs the container in persistent mode', async t => {
  const docker = sinon.stub(new Docker());
  docker.listImages.returns([{ RepoTags: ['cnadiminti/dynamodb-local:latest'] }]);
  const container = sinon.stub({ start: () => null, inspect: () => null });
  container.start.returns(Promise.resolve(null));
  container.inspect.returns({
    NetworkSettings: {
      Ports: {
        '8000/tcp': [
          { HostPort: 1337 }
        ]
      }
    }
  });
  docker.createContainer.returns(container);
  await launchDynamoContainer({ docker });
  sinon.assert.neverCalledWith(docker.createContainer, sinon.match({ Cmd: ['-inMemory', '-sharedDb'] }));
});

test('launchDynamoContanier works with its default parameters', async t => {
  const { url, stopContainer } = await launchDynamoContainer();
  await stopContainer();
  t.truthy(url.match(/http:\/\/.*:\d+/));
});

test('launchDynamoContanier works without docker stubbed', async t => {
  const { url, stopContainer } = await launchDynamoContainer({ inMemory: true });
  await stopContainer();
  t.truthy(url.match(/http:\/\/.*:\d+/));
});
