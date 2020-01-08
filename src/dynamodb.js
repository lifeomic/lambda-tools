const AWS = require('aws-sdk');
const cloneDeep = require('lodash/cloneDeep');
const fromPairs = require('lodash/fromPairs');
const Docker = require('dockerode');
const Environment = require('./Environment');
const uuid = require('uuid/v4');

const { getHostAddress, ensureImage } = require('./docker');
const { buildConnectionAndConfig, waitForReady } = require('./utils/awsUtils');

const DYNAMODB_IMAGE = 'cnadiminti/dynamodb-local:latest';

const logger = require('./utils/logging').getLogger('dynamodb');

let tablesSchema = [];

function setNotRetryable (response) {
  if (response.error.code !== 'InternalFailure') {
    // Do not retry table deletion because it leads to
    // ResourceNotFoundException when trying to delete the table twice
    // Do not retry table creation because it leads to
    // ResourceInUseException when trying to create the table twice
    response.error.retryable = false;
  }
}

async function createTables (dynamoClient, uniqueIdentifier) {
  const failedProvisons = [];
  await Promise.all(
    tablesSchema.map(async table => {
      const newTable = cloneDeep(table);
      const TableName = getTableName(newTable.TableName, uniqueIdentifier);
      newTable.TableName = TableName;

      try {
        const createRequest = dynamoClient.createTable(newTable);
        createRequest.on('retry', setNotRetryable);

        try {
          await createRequest.promise();
        } catch (e) {
          if (e.code === 'TimeoutError') {
            // Use a custom retry instead of the AWS provided
            // `dynamoClient.waitFor('tableExists',` because the waitFor
            // behavior is hardcoded to delay by 20 seconds and retry 25 times
            await waitForReady(`Created table ${TableName}`, () =>
              dynamoClient.describeTable({ TableName }).promise()
            );
          } else {
            throw e;
          }
        }
      } catch (err) {
        failedProvisons.push(TableName);
        logger.error(`Failed to create table "${TableName}"`, JSON.stringify({ err }, null, 2));
      }
    })
  );

  if (failedProvisons.length) {
    try {
      await destroyTables(dynamoClient, uniqueIdentifier);
    } catch (err) {
      logger.error(`Failed to destroy tables after error`, err);
    }
    throw new Error(`Failed to create tables: ${failedProvisons.join(', ')}`);
  }
}

async function assertTableDoesNotExist (dynamoClient, tableName) {
  try {
    await dynamoClient.describeTable({ TableName: tableName }).promise();
    throw new Error(`Table ${tableName} still exists`);
  } catch (e) {
    if (e.code !== 'ResourceNotFoundException') {
      throw e;
    }

    // This is what we've been waiting for, the table is gone
  }
}

async function destroyTables (dynamoClient, uniqueIdentifier) {
  const failedDeletions = [];
  const { TableNames } = await dynamoClient.listTables().promise();
  const schemaTableNames = tablesSchema
    .map(({ TableName }) => getTableName(TableName, uniqueIdentifier));
  const tablesToDestroy = TableNames
    .filter(name => schemaTableNames.includes(name));

  await Promise.all(
    tablesToDestroy
      .map(async TableName => {
        try {
          const deleteRequest = dynamoClient.deleteTable({ TableName });

          deleteRequest.on('retry', setNotRetryable);

          try {
            await deleteRequest.promise();
          } catch (e) {
            if (e.code === 'TimeoutError') {
              await waitForReady(`Deleted table ${TableName}`, () =>
                assertTableDoesNotExist(dynamoClient, TableName)
              );
            } else {
              throw e;
            }
          }
        } catch (err) {
          failedDeletions.push(TableName);
          logger.error(`Failed to destroy table "${TableName}"`, JSON.stringify({ err }, null, 2));
        }
      })
  );

  if (failedDeletions.length) {
    throw new Error(`Failed to destroy tables: ${failedDeletions.join(', ')}`);
  }
}

/**
 * @param {object} opts
 * @param {object} opts.docker Used to mock the Docker library in tests
 * @param {boolean} opts.inMemory Whether to run local DynamoDB in in-memory mode.
 * 'false' persists data to disk.
 */
async function launchDynamoContainer ({ docker = new Docker(), inMemory = false } = {}) {
  await ensureImage(docker, DYNAMODB_IMAGE);

  const container = await docker.createContainer({
    HostConfig: {
      AutoRemove: true,
      PublishAllPorts: true
    },
    ExposedPorts: { '8000/tcp': {} },
    Image: DYNAMODB_IMAGE,
    ...(inMemory ? { Cmd: ['-inMemory', '-sharedDb'] } : {})
  });

  await container.start();

  const containerData = await container.inspect();
  const host = await getHostAddress();
  const port = containerData.NetworkSettings.Ports['8000/tcp'][0].HostPort;
  const url = `http://${host}:${port}`;

  return { url, stopContainer: () => container.stop() };
}

/**
 * @param {object} opts
 * @param {boolean} opts.inMemory Whether to run local DynamoDB in in-memory mode.
 * 'false' persists data to disk.
 */
async function getConnection (opts) {
  if (process.env.DYNAMODB_ENDPOINT) {
    return buildConnectionAndConfig({ url: process.env.DYNAMODB_ENDPOINT });
  }

  const { url, stopContainer } = await launchDynamoContainer(opts);

  const environment = new Environment();
  environment.set('AWS_ACCESS_KEY_ID', 'bogus');
  environment.set('AWS_SECRET_ACCESS_KEY', 'bogus');
  environment.set('AWS_REGION', 'us-east-1');
  environment.set('DYNAMODB_ENDPOINT', url);

  const { connection, config } = buildConnectionAndConfig({
    url,
    cleanup: () => {
      environment.restore();
      return stopContainer();
    }
  });

  const dynamoClient = new AWS.DynamoDB(config);

  await waitForReady('DynamoDB', async () => dynamoClient.listTables().promise());

  return { connection, config };
}

function getTableName (tableName, uniqueIdentifier) {
  return uniqueIdentifier ? `${tableName}-${uniqueIdentifier}` : tableName;
}

function buildTableNameMapping (schemas, uniqueIdentifier) {
  return fromPairs(schemas.map(({ TableName }) => {
    return [TableName, getTableName(TableName, uniqueIdentifier)];
  }));
}

exports.tableSchema = (schema) => {
  tablesSchema = cloneDeep(schema);
};

/**
 * @param {boolean} useUniqueTables
 * @param {object} opts
 * @param {boolean} opts.inMemory Determines whether to run the local DynamoDB instance
 * in in-memory mode, or to persist the data to disk
 */
function dynamoDBTestHooks (useUniqueTables = false, opts) {
  let connection, config;

  async function beforeAll () {
    const result = await getConnection(opts);
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
exports.launchDynamoContainer = launchDynamoContainer;

/**
 * @param {TestInterface} test ava object
 * @param {boolean} useUniqueTables
 * @param {object} opts
 * @param {boolean} opts.inMemory Determines whether to run the local DynamoDB instance
 * in in-memory mode, or to persist the data to disk
 */
exports.useDynamoDB = (test, useUniqueTables, opts) => {
  const testHooks = dynamoDBTestHooks(useUniqueTables, opts);

  test.serial.before(testHooks.beforeAll);

  test.serial.beforeEach(async (test) => {
    test.context.dynamodb = await testHooks.beforeEach();
  });

  test.serial.afterEach.always(async test => {
    await testHooks.afterEach(test.context.dynamodb);
  });

  test.after.always(testHooks.afterAll);
};
