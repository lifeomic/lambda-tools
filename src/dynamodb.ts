import assert from 'assert';
import {
  DynamoDB,
  DynamoDBStreams
} from 'aws-sdk';
import cloneDeep from 'lodash/cloneDeep';
import fromPairs from 'lodash/fromPairs';
import Docker from 'dockerode';
import Environment from './Environment';
import { v4 as uuid } from 'uuid';
import { pQueue } from './utils/config';
import {
  AwsUtilsConnection,
  ConnectionAndConfig,
  SimpleServiceConfigurationOptions,
} from "./utils/awsUtils";
import {TestInterface} from "ava";
import {Response} from "aws-sdk/lib/response";

const { getHostAddress, ensureImage } = require('./docker');
const { buildConnectionAndConfig, waitForReady } = require('./utils/awsUtils');

const DYNAMODB_IMAGE = 'cnadiminti/dynamodb-local:latest';

const logger = require('./utils/logging').getLogger('dynamodb');

export type MappedTableNames<KeyArray extends string[]> = {[Key in KeyArray[number]]: string}

export interface DynamoDBContext<TableNames extends string[]> {
  documentClient: DynamoDB.DocumentClient;
  dynamoClient: DynamoDB;
  streamsClient: DynamoDBStreams;

  tableNames: MappedTableNames<TableNames>;
  uniqueIdentifier: string;
  config: SimpleServiceConfigurationOptions;
}

export interface DynamoDBTestContext<TableNames extends string[]> {
  dynamodb: DynamoDBContext<TableNames>;
}

export interface DynamoDBTestOptions {
  inMemory?: boolean;
  docker?: Docker;
  tableSchemas?: DynamoDB.CreateTableInput[];
}

export interface LaunchDockerContainerResults {
  url: string;
  stopContainer(): Promise<any>;
}

const tableSchemas: DynamoDB.CreateTableInput[] = [];

export function tableSchema (schema: DynamoDB.CreateTableInput[]): void {
  tableSchemas.length = 0;
  tableSchemas.push(...cloneDeep(schema));
}

function setNotRetryable (response: Response<any, any>) {
  if (response.error.code !== 'InternalFailure') {
    // Do not retry table deletion because it leads to
    // ResourceNotFoundException when trying to delete the table twice
    // Do not retry table creation because it leads to
    // ResourceInUseException when trying to create the table twice
    response.error.retryable = false;
  }
}

function getTableName (tableName: string, uniqueIdentifier?: string): string {
  return `${tableName}${uniqueIdentifier ? `-${uniqueIdentifier}` : ''}`;
}

function buildTableNameMapping (
  schemas: DynamoDB.CreateTableInput[],
  uniqueIdentifier?: string
): Record<string, string> {
  return fromPairs(schemas.map(({ TableName }) => {
    return [TableName, getTableName(TableName, uniqueIdentifier)];
  }));
}

async function assertTableDoesNotExist (dynamoClient: DynamoDB, tableName: string) {
  try {
    await dynamoClient.describeTable({ TableName: tableName }).promise();
  } catch (e) {
    // This is what we've been waiting for, the table is gone
    if (e.code === 'ResourceNotFoundException'){
      return true;
    }
    throw e;
  }
  throw new Error(`Table ${tableName} still exists`);
}

export async function destroyTables (
  schemas: DynamoDB.CreateTableInput[],
  dynamoClient: AWS.DynamoDB,
  uniqueIdentifier?: string
) {
  const failedDeletions: string[] = [];
  const { TableNames = [] } = await dynamoClient.listTables().promise();
  const schemaTableNames = schemas
    .map(({ TableName }) => getTableName(TableName, uniqueIdentifier));
  const tablesToDestroy = TableNames
    .filter(name => schemaTableNames.includes(name));

  await pQueue.addAll(
    tablesToDestroy
      .map(TableName => async () => {
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
              failedDeletions.push(TableName);
              logger.error(`Failed to destroy table "${TableName}"`, JSON.stringify({ err: e }, null, 2));
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

export async function createTables (
  schemas: DynamoDB.CreateTableInput[],
  dynamoClient: AWS.DynamoDB,
  uniqueIdentifier?: string
) {
  const failedProvisons: string[] = [];
  await pQueue.addAll(
    schemas.map(table => async () => {
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
            failedProvisons.push(TableName);
            logger.error(`Failed to create table "${TableName}"`, JSON.stringify({ err: e }, null, 2));
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
      await destroyTables(schemas, dynamoClient, uniqueIdentifier);
    } catch (err) {
      logger.error(`Failed to destroy tables after error`, err);
    }
    throw new Error(`Failed to create tables: ${failedProvisons.join(', ')}`);
  }
}

/**
 * @param {object} opts
 * @param {object} opts.docker Used to mock the Docker library in tests
 * @param {boolean} opts.inMemory Whether to run local DynamoDB in in-memory mode.
 * 'false' persists data to disk.
 */
export async function launchDynamoContainer ({ docker = new Docker(), inMemory = false }: DynamoDBTestOptions = {}) {
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
export async function getConnection (opts?: DynamoDBTestOptions): Promise<ConnectionAndConfig> {
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

  const dynamoClient = new DynamoDB(config);

  await waitForReady('DynamoDB', async () => dynamoClient.listTables().promise());

  return { connection, config };
}

/**
 * @param {boolean} useUniqueTables
 * @param {object} opts
 * @param {boolean} opts.inMemory Determines whether to run the local DynamoDB instance
 * in in-memory mode, or to persist the data to disk
 */
export function dynamoDBTestHooks <TableNames extends string[]>(
  useUniqueTables = false,
  opts?: DynamoDBTestOptions
) {
  let connection: AwsUtilsConnection | undefined;
  let config: SimpleServiceConfigurationOptions | undefined;
  const schemas: DynamoDB.CreateTableInput[] = opts?.tableSchemas || tableSchemas;

  async function beforeAll () {
    const result = await getConnection(opts);
    connection = result.connection;
    config = result.config;
  }

  async function beforeEach (): Promise<DynamoDBContext<TableNames>> {
    assert(config, 'Invalid DynamoDB test configuration.');
    const uniqueIdentifier = useUniqueTables ? uuid() : '';
    const dynamoClient = new DynamoDB(config);
    const streamsClient = new DynamoDBStreams(config);

    const context: DynamoDBContext<TableNames> = {
      documentClient: new DynamoDB.DocumentClient({ service: dynamoClient }),
      dynamoClient,
      streamsClient,
      tableNames: buildTableNameMapping(schemas, uniqueIdentifier) as MappedTableNames<TableNames>,
      uniqueIdentifier,
      config: config!
    };

    await createTables(schemas, dynamoClient, uniqueIdentifier);
    return context;
  }

  async function afterEach (context?: DynamoDBContext<any>) {
    if (!context) {
      return;
    }
    const { dynamoClient, uniqueIdentifier } = context;
    await destroyTables(schemas, dynamoClient, uniqueIdentifier);
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

/**
 * @param {TestInterface} anyTest ava object
 * @param {boolean} useUniqueTables
 * @param {DynamoDBTestOptions} opts
 * @param {boolean} opts.inMemory Determines whether to run the local DynamoDB instance
 * in in-memory mode, or to persist the data to disk
 */
export function useDynamoDB (
  anyTest: TestInterface,
  useUniqueTables?: boolean,
  opts?: DynamoDBTestOptions
) {
  const test = anyTest as TestInterface<DynamoDBTestContext<any>>
  const testHooks = dynamoDBTestHooks(useUniqueTables, opts);

  test.serial.before(testHooks.beforeAll);

  test.serial.beforeEach(async (test) => {
    test.context.dynamodb = await testHooks.beforeEach();
  });

  test.serial.afterEach.always(async test => {
    await testHooks.afterEach(test.context.dynamodb);
  });

  test.after.always(testHooks.afterAll);
}
