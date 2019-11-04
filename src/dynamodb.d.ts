import {DynamoDB, DynamoDBStreams} from "aws-sdk";
import {TestInterface} from "ava";
import Docker = require('dockerode');
import {ConnectionAndConfig, SimpleServiceConfigurationOptions} from "./utils/awsUtils";

export interface DynamoDBContext {
  documentClient: DynamoDB.DocumentClient;
  dynamoClient: DynamoDB;
  streamsClient: DynamoDBStreams;

  tableNames: {[key: string]: string},
  uniqueIdentifier: string,
  config: SimpleServiceConfigurationOptions
}

export interface DynamoDbTestContext {
  dynamodb: DynamoDBContext;
}

export interface LaunchDockerContainerOptions {
  inMemory: boolean;
  docker: Docker;
}

export interface LaunchDockerConatinerResults {
  url: string;
  stopContainer(): Promise<any>;
}


export interface Hooks {
  beforeAll(): Promise<void>;
  beforeEach(): Promise<DynamoDBContext>;
  afterEach(context: DynamoDBContext): Promise<void>;
  afterAll(): Promise<void>;
}

export function tableSchema(
  schema: ReadonlyArray<DynamoDB.Types.CreateTableInput>
): void;

export function dynamoDBTestHooks(useUniqueTables?: boolean, opts?: {inMemory: boolean}): Hooks;


export function useDynamoDB<T extends DynamoDbTestContext>(
  test: TestInterface<T>,
  useUniqueTables?: boolean,
  opts?: LaunchDockerContainerOptions
): void;


export function getConnection(opts?: LaunchDockerContainerOptions): Promise<ConnectionAndConfig>;

export function createTables(dynamoClient: DynamoDB, uniqueIdentifier?: string): Promise<void>;

export function destroyTables(dynamoClient: DynamoDB, uniqueIdentifier?: string): Promise<void>;

export function launchDynamoContainer(options?: LaunchDockerContainerOptions): Promise<LaunchDockerConatinerResults>;
