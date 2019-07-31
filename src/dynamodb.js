const AWS = require('aws-sdk');
const cloneDeep = require('lodash/cloneDeep');
const fromPairs = require('lodash/fromPairs');
const Docker = require('dockerode');
const Environment = require('./Environment');
const uuid = require('uuid/v4');

const { getHostAddress, ensureImage } = require('./docker');
const { buildConnectionAndConfig, waitForReady } = require('./utils/awsUtils');

const DYNAMODB_IMAGE = 'cnadiminti/dynamodb-local:latest';

let tablesSchema = [];

async function createTables (dynamoClient, uniqueIdentifier) {
  const failedProvisons = [];
  await Promise.all(
    tablesSchema.map(async table => {
      const newTable = cloneDeep(table);
      const TableName = getTableName(newTable.TableName, uniqueIdentifier);
      newTable.TableName = TableName;

      try {
        await dynamoClient.createTable(newTable).promise();
        await dynamoClient.waitFor('tableExists', { TableName }).promise();
      } catch (err) {
        failedProvisons.push(TableName);
        console.error(`Failed to create table "${TableName}"`, err);
      }
    })
  );

  if (failedProvisons.length) {
    try {
      await destroyTables(dynamoClient, uniqueIdentifier);
    } catch (err) {
      console.error(`Failed to destroy tables after error`, err);
    }
    throw new Error(`Failed to create tables: ${failedProvisons.join(', ')}`);
  }
}

async function destroyTables (dynamoClient, uniqueIdentifier) {
  const failedDeletions = [];
  const { TableNames } = await dynamoClient.listTables().promise();
  const schemaTableNames = tablesSchema
    .map(({ TableName }) => getTableName(TableName, uniqueIdentifier));
  const tablesToDestroy = TableNames
    .filter(name => schemaTableNames.includes(getTableName(name, uniqueIdentifier)));

  await Promise.all(
    tablesToDestroy
      .map(async TableName => {
        try {
          await dynamoClient.deleteTable({ TableName }).promise();
          await dynamoClient.waitFor('tableNotExists', { TableName }).promise();
        } catch (err) {
          failedDeletions.push(TableName);
          console.error(`Failed to destroy table "${TableName}"`, err);
        }
      })
  );

  if (failedDeletions.length) {
    throw new Error(`Failed to destroy tables: ${failedDeletions.join(', ')}`);
  }
}

async function getConnection (externalConfig) {
  if (process.env.DYNAMODB_ENDPOINT) {
    return buildConnectionAndConfig({url: process.env.DYNAMODB_ENDPOINT, externalConfig});
  }

  const docker = new Docker();
  const environment = new Environment();

  await ensureImage(docker, DYNAMODB_IMAGE);

  const container = await docker.createContainer({
    HostConfig: {
      AutoRemove: true,
      PublishAllPorts: true
    },
    ExposedPorts: { '8000/tcp': {} },
    Image: DYNAMODB_IMAGE
  });

  await container.start();

  const containerData = await container.inspect();
  const host = await getHostAddress();
  const port = containerData.NetworkSettings.Ports['8000/tcp'][0].HostPort;

  const {connection, config} = buildConnectionAndConfig({
    accessKey: 'bogus',
    secretAccessKey: 'bogus',
    url: `http://${host}:${port}`,
    cleanup: () => {
      environment.restore();
      return container.stop();
    },
    externalConfig
  });

  const dynamoClient = new AWS.DynamoDB(config);

  await waitForReady('DynamoDB', async () => dynamoClient.listTables().promise());

  environment.set('AWS_ACCESS_KEY_ID', connection.accessKey);
  environment.set('AWS_SECRET_ACCESS_KEY', connection.secretAccessKey);
  environment.set('AWS_REGION', connection.region);
  environment.set('DYNAMODB_ENDPOINT', connection.url);

  return {connection, config};
}

function getTableName (tableName, uniqueIdentifier) {
  return uniqueIdentifier ? `${tableName}-${uniqueIdentifier}` : tableName;
}

function buildTableNameMapping (schemas, uniqueIdentifier) {
  return fromPairs(schemas.map(({TableName}) => {
    return [TableName, getTableName(TableName, uniqueIdentifier)];
  }));
}

exports.tableSchema = (schema) => {
  tablesSchema = cloneDeep(schema);
};

function dynamoDBTestHooks (useUniqueTables = false, externalConfig) {
  let connection, config;

  async function beforeAll () {
    const result = await getConnection(externalConfig);
    connection = result.connection;
    config = result.config;
  }

  async function beforeEach () {
    const uniqueIdentifier = useUniqueTables ? uuid() : '';
    const service = new AWS.DynamoDB(config);
    const streamsClient = new AWS.DynamoDBStreams(config);

    const context = {
      documentClient: new AWS.DynamoDB.DocumentClient({ service }),
      dynamoClient: service,
      streamsClient,
      tableNames: buildTableNameMapping(tablesSchema, uniqueIdentifier),
      uniqueIdentifier,
      config
    };

    await createTables(service, uniqueIdentifier);

    return context;
  }

  async function afterEach (context) {
    if (!context) {
      return;
    }
    const { dynamoClient, uniqueIdentifier } = context;
    await destroyTables(dynamoClient, uniqueIdentifier);
  }

  async function afterAll () {
    // If the beforeAll block executed long enough to set a connection,
    // then it should be cleaned up
    if (connection) {
      await connection.cleanup();
    }
  }

  return {
    beforeAll, beforeEach, afterEach, afterAll
  };
}

exports.getConnection = getConnection;
exports.createTables = createTables;
exports.destroyTables = destroyTables;
exports.dynamoDBTestHooks = dynamoDBTestHooks;

exports.useDynamoDB = (test, useUniqueTables, externalConfig) => {
  const testHooks = dynamoDBTestHooks(useUniqueTables, externalConfig);

  test.before(testHooks.beforeAll);

  test.beforeEach(async (test) => {
    test.context.dynamodb = await testHooks.beforeEach();
  });

  test.afterEach.always(async test => {
    await testHooks.afterEach(test.context.dynamodb);
  });

  test.after.always(testHooks.afterAll);
};
