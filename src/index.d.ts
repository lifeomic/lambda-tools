import * as aws from "aws-sdk";
import { TestInterface } from "ava";
import { ServiceConfigurationOptions } from "aws-sdk/lib/service";
import { Client as ElasticSearchClient } from "@elastic/elasticsearch";
import { AxiosInstance, AxiosPromise } from "axios";

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

  export function streams(streams: ReadonlyArray<string>): void;
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

declare namespace localStack {
  export interface LocalStackService<T> {
    config: ServiceConfigurationOptions;
    client: T;
    isReady(client: T): Promise<any>;
  }

  export interface LocalStackServices {
    apigateway: LocalStackService<aws.APIGateway>;
    cloudformation: LocalStackService<aws.CloudFormation>;
    cloudwatch: LocalStackService<aws.CloudWatch>;
    cloudwatchlogs: LocalStackService<aws.CloudWatchLogs>;
    dynamodb: LocalStackService<aws.DynamoDB>;
    dynamodbstreams: LocalStackService<aws.DynamoDBStreams>;
    ec2: LocalStackService<aws.EC2>;
    es: LocalStackService<aws.ES>;
    elasticsearch: LocalStackService<ElasticSearchClient>;
    // eLocalStackService<vents: aws.CloudWatchEvents>;
    firehose: LocalStackService<aws.Firehose>;
    iam: LocalStackService<aws.IAM>;
    kinesis: LocalStackService<aws.Kinesis>;
    lambda: LocalStackService<aws.Lambda>;
    redshift: LocalStackService<aws.Redshift>;
    route53: LocalStackService<aws.Route53>;
    s3: LocalStackService<aws.S3>;
    secretsmanager: LocalStackService<aws.SecretsManager>;
    ses: LocalStackService<aws.SES>;
    sns: LocalStackService<aws.SNS>;
    sqs: LocalStackService<aws.SQS>;
    ssm: LocalStackService<aws.SSM>;
    stepfunctions: LocalStackService<aws.StepFunctions>;
    sts: LocalStackService<aws.STS>;
  }

  export interface Context {
    services: LocalStackServices;
  }

  export interface Hooks {
    beforeAll(): Promise<Context>;
    afterAll(): Promise<void>;
  }

  export interface Config {
    versionNumberTag: string;
    services: Array<keyof LocalStackServices>;
  }

  export function localStackHooks(config: Config): Hooks;
  export function useLocalStack(test: TestInterface, config: Config): void;
}

declare namespace lambda {
  export interface Environment {
    [key:string]: string | null;
  }

  export interface LocalOptions {
    environment?: Environment
    mountPoint?: string;
    handler?: string;
    image?: string;
    useComposeNetwork?: boolean;
  }

  export interface NewContainerOptions {
    environment?: Environment
    mountpoint?: string;
    mountpointParent?: string;
    zipfile?: string;
    handler: string;
    image: string;
    useComposeNetwork?: boolean;
  }

  export interface ComposeContainerOptions {
    environment?: Environment
    service: string;
    handler: string;
  }

  export interface WebpackOptions {
    entrypoint: string;
    serviceName?: string;
    zip?: boolean;
    nodeVersion?: string;
    outputPath?: string;
    configTransformer?: (config: any) => Promise<any>;
  }

  export interface CreateLambdaExecutionEnvironmentOptions {
    environment?: Environment;
    image?: string;
    zipfile?: string;
    network?: string;
    mountpointParent?: string;
    mountpoint?: string;
    service?: string;
  }

  export interface LambdaExecutionEnvironment {
    network?: any;
    container?: any;
    cleanupMountpoint?: () => Promise<void>;
  }

  export interface DestroyLambdaExecutionEnvironmentOptions {
    cleanupMountpoint?: boolean;
    container?: boolean;
    network?: boolean;
  }

  export interface AlphaClient extends AxiosInstance {
    raw<T = any>(event: {}, environment: Environment, handler: string): Promise<T>;
    graphql<T = any>(path, query, variables, config): AxiosPromise<T>
  }

  export interface TestHooks {
    beforeAll(): Promise<void>;
    afterAll(): Promise<void>;
    beforeEach(): Promise<AlphaClient>;
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
