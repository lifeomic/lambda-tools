import AWS from 'aws-sdk';
import NestedError from 'nested-error-stacks';
import promiseRetry from 'promise-retry';
import { ServiceConfigurationOptions } from 'aws-sdk/lib/service';
import { getLogger } from './logging';

const logger = getLogger('awsUtils');

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
    maxRetries: 10,
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
  cleanup = () => undefined,
}: BuildConnectionAndConfigOptions): ConnectionAndConfig {
  const connection: AwsUtilsConnection = {
    url,
    cleanup,
    region: process.env.AWS_REGION || 'us-east-1',
    accessKey: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  };
  const config = buildConfigFromConnection(connection);
  return { connection, config };
}

export async function waitForReady (awsType: string, retryFunc: () => Promise<any>) {
  const start = Date.now();
  await promiseRetry(async (retry, retryNumber) => {
    try {
      await retryFunc();
    } catch (error: any) {
      const message = `${awsType} is still not ready after ${retryNumber} connection attempts. Running for ${Date.now() - start}`;
      logger.debug(message, error);
      retry(new NestedError(message, error as Error));
    }
  }, { maxTimeout: 1000, retries: 20 });
}
