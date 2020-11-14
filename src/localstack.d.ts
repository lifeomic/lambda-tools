import {ServiceConfigurationOptions} from "aws-sdk/lib/service";
import * as aws from "aws-sdk";
import {Client as ElasticSearchClient} from "@elastic/elasticsearch";
import {TestInterface} from "ava";
import {Container} from "dockerode";

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

export interface LocalStackContext {
  services: LocalStackServices;
}

export interface LocalStackTestContext {
  localStack: LocalStackContext;
}

export interface Config {
  versionNumberTag: string;
  services: Array<keyof LocalStackServices>;
}

export interface Hooks {
  beforeAll(): Promise<LocalStackContext>;
  afterAll(): Promise<void>;
}

export interface Config {
  versionNumberTag: string;
  services: Array<keyof LocalStackServices>;
}

export function localStackHooks(config: Config): Hooks;
export function useLocalStack<T extends LocalStackTestContext>(test: TestInterface<T>, config: Config): void;
export function localstackReady(container: Container): Promise<void>;
