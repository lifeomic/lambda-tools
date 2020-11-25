import AWS from 'aws-sdk';
import NestedError from 'nested-error-stacks';
import promiseRetry from 'promise-retry';
import {ServiceConfigurationOptions} from "aws-sdk/lib/service";

export interface AwsUtilsConnection {
  url: string;
  cleanup: () => any;
  region: string;
  accessKey: string;
  secretAccessKey: string;
}

export type ConfigurationOptions = Pick<ServiceConfigurationOptions, 'credentials' | 'endpoint' | 'region' | 'maxRetries'>;

export function buildConfigFromConnection (connection: AwsUtilsConnection): ConfigurationOptions {
  return {
    credentials: new AWS.Credentials(connection.accessKey, connection.secretAccessKey),
    endpoint: connection.url,
    region: connection.region,
    maxRetries: 10
  };
}

export interface BuildConnectionAndConfigOptions {
  url: string;
  cleanup?: () => any;
}

export interface ConnectionAndConfig {
  connection: AwsUtilsConnection;
  config: ConfigurationOptions;
}

export function buildConnectionAndConfig ({
  url,
  cleanup = () => undefined
}: BuildConnectionAndConfigOptions): ConnectionAndConfig {
  const connection: AwsUtilsConnection = {
    url,
    cleanup,
    region: process.env.AWS_REGION || 'us-east-1',
    accessKey: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!
  };
  const config = buildConfigFromConnection(connection);
  return { connection, config };
}

export async function waitForReady (awsType: string, retryFunc: () => Promise<any>) {
  await promiseRetry(async function (retry, retryNumber) {
    try {
      await retryFunc();
    } catch (error) {
      retry(new NestedError(`${awsType} is still not ready after ${retryNumber} connection attempts`, error));
    }
  }, { minTimeout: 500, retries: 20 });
}
