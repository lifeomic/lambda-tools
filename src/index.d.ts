import * as aws from "aws-sdk";
import { TestInterface } from "ava";
import {ServiceConfigurationOptions} from "aws-sdk/lib/service";

export interface HttpError {
  message: string;
  path: string[];
}

export interface Response {
  statusCode: number;
  error: string;
  body: {
    errors: HttpError[];
  };
}

declare namespace dynamodb {
  export interface Context {
    documentClient: aws.DynamoDB.DocumentClient;
    dynamoClient: aws.DynamoDB;
    streamsClient: aws.DynamoDBStreams;

    tableNames: {[key: string]: string},
    uniqueIdentifier: string,
    config: ServiceConfigurationOptions
  }

  export interface Hooks {
    beforeAll(): Promise<void>;
    beforeEach(): Promise<Context>;
    afterEach(context: Context): Promise<void>;
    afterAll(): Promise<void>;
  }

  export function tableSchema(
    schema: ReadonlyArray<aws.DynamoDB.Types.CreateTableInput>
  ): void;
  export function dynamoDBTestHooks(useUniqueTables?: boolean): Hooks;
  export function useDynamoDB(test: TestInterface, useUniqueTables?: boolean): void;
}

declare namespace kinesis {
  export interface Context {
    kinesisClient: aws.Kinesis;
    config: ServiceConfigurationOptions;
    streamNames: {[key: string]: string};
    uniqueIdentifier: string;
  }

  export interface Hooks {
    beforeAll(): Promise<void>;
    beforeEach(): Promise<Context>;
    afterEach(context: Context): Promise<void>;
    afterAll(): Promise<void>;
  }

  export function streams(
    streams: ReadonlyArray<string>
  ): void;
  export function kinesisTestHooks(useUniqueStreams?: boolean): Hooks;
  export function useKinesisDocker(test: TestInterface, useUniqueTables?: boolean): void;
  export function useKinesis(test: TestInterface, useUniqueTables?: boolean): void;
}

declare namespace graphql {
  export function useGraphQL(test: TestInterface): void;
  export function setupGraphQL(setupGraphQL: Function): void;
  export function assertSuccess(response: Response): void;
  export function assertError(response: Response, path: {}, messageTest: string)
}

declare namespace lambda {
  interface Environment {
    [key:string]: string | null;
  }

  interface LocalOptions {
    environment?: Environment
    mountPoint?: string;
    handler?: string;
    image?: string;
    useComposeNetwork?: boolean;
  }

  interface NewContainerOptions {
    environment?: Environment
    mountpoint?: string;
    mountpointParent?: string;
    zipfile?: string;
    handler: string;
    image: string;
    useComposeNetwork?: boolean;
  }

  interface ComposeContainerOptions {
    environment?: Environment
    service: string;
    handler: string;
  }

  interface WebpackOptions {
    entrypoint: string;
    serviceName?: string;
    zip?: boolean;
    nodeVersion?: string;
    outputPath?: string;
    configTransformer?: (config: any) => Promise<any>;
  }

  interface CreateLambdaExecutionEnvironmentOptions {
    environment?: Environment;
    image?: string;
    zipfile?: string;
    network?: string;
    mountpointParent?: string;
    mountpoint?: string;
    service?: string;
  }

  interface LambdaExecutionEnvironment {
    network?: any;
    container?: any;
    cleanupMountpoint?: () => Promise<void>;
  }

  interface DestroyLambdaExecutionEnvironmentOptions {
    cleanupMountpoint?: boolean;
    container?: boolean;
    network?: boolean;
  }

  interface TestHooks {
    beforeAll(): Promise<void>;
    afterAll(): Promise<void>;
    beforeEach(): Promise<any>;
  }

  export class LambdaRunner {
    constructor(container: string, environment: Environment, handler: string)
    invoke(event: any): Promise<any>;
  }

  export function useLambda(test: TestInterface, options?: LocalOptions): void;
  export function useLambdaHooks(options?: LocalOptions): TestHooks;
  export function useNewContainer(options?: NewContainerOptions): void;
  export function useComposeContainer(options?: ComposeContainerOptions): void;
  export function build(options?: WebpackOptions): Promise<any>;
  export function createLambdaExecutionEnvironment(options?: CreateLambdaExecutionEnvironmentOptions): Promise<LambdaExecutionEnvironment>;
  export function destroyLambdaExecutionEnvironment(options?: DestroyLambdaExecutionEnvironmentOptions): Promise<void>;
}
