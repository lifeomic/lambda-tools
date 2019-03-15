const AWS = require('aws-sdk');
const cloneDeep = require('lodash/cloneDeep');
const fromPairs = require('lodash/fromPairs');
const Docker = require('dockerode');
const Environment = require('./Environment');
const promiseRetry = require('promise-retry');
const NestedError = require('nested-error-stacks');
const uuid = require('uuid/v4');

const { getHostAddress, ensureImage } = require('./docker');

const DYNAMODB_IMAGE = 'cnadiminti/dynamodb-local:latest';

let tablesSchema = [];

function buildConfigFromConnection (connection) {
  return {
    credentials: new AWS.Credentials(connection.accessKey, connection.secretAccessKey),
    endpoint: new AWS.Endpoint(connection.url),
    region: connection.region
  };
}

async function createTables (dynamoClient, uniqueIdentifier) {
  await Promise.all(tablesSchema.map(table => {
    const newTable = cloneDeep(table);
    newTable.TableName = getTableName(newTable.TableName, uniqueIdentifier);
    return dynamoClient.createTable(newTable).promise();
  }));
}

async function destroyTables (dynamoClient, uniqueIdentifier) {
  await Promise.all(tablesSchema.map(({TableName}) => {
    return dynamoClient.deleteTable({
      TableName: getTableName(TableName, uniqueIdentifier)
    }).promise();
  }));
}

async function waitForDynamoDBToBeReady (dynamoClient) {
  await promiseRetry(async function (retry, retryNumber) {
    try {
      await dynamoClient.listTables().promise();
    } catch (error) {
      retry(new NestedError(`DynamoDB is still not ready after ${retryNumber} connection attempts`, error));
    }
  }, {factor: 1, minTimeout: 100, retries: 1000});
}

async function getConnection () {
  if (process.env.DYNAMODB_ENDPOINT) {
    const connection = {
      accessKey: process.env.AWS_ACCESS_KEY_ID,
      cleanup: () => {},
      region: 'us-east-1',
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      url: process.env.DYNAMODB_ENDPOINT
    };
    const config = buildConfigFromConnection(connection);
    return {connection, config};
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

  const connection = {
    accessKey: 'bogus',
    cleanup: () => {
      environment.restore();
      return container.stop();
    },
    region: 'us-east-1',
    secretAccessKey: 'bogus',
    url: `http://${host}:${port}`
  };

  const config = buildConfigFromConnection(connection);
  const dynamoClient = new AWS.DynamoDB(config);
  await waitForDynamoDBToBeReady(dynamoClient);

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

function dynamoDBTestHooks (useUniqueTables = false) {
  let connection, config;

  async function beforeAll () {
    const result = await getConnection();
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
    const {dynamoClient, uniqueIdentifier} = context;
    await destroyTables(dynamoClient, uniqueIdentifier);
  }

  async function afterAll () {
    await connection.cleanup();
  }

  return {
    beforeAll, beforeEach, afterEach, afterAll
  };
}
exports.dynamoDBTestHooks = dynamoDBTestHooks;

exports.useDynamoDB = (test, useUniqueTables) => {
  const testHooks = dynamoDBTestHooks(useUniqueTables);

  (test.serial || test).before(testHooks.beforeAll);

  (test.serial || test).beforeEach(async (test) => {
    const context = await testHooks.beforeEach();
    test.context.dynamodb = context;
  });

  (test.serial || test).afterEach.always(async test => {
    const context = test.context.dynamodb;
    await testHooks.afterEach(context);
  });

  (test.serial || test).after.always(testHooks.afterAll);
};
