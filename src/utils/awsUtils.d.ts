import {Credentials, Endpoint} from "aws-sdk";
import { OperationOptions } from "retry";

export interface SimpleServiceConfigurationOptions {
  credentials: Credentials;
  endpoint: Endpoint | string;
  region: string;
  maxRetries: number;
}

export interface AwsUtilsConnection {
  url: string;
  cleanup: () => any;
  region: string;
  accessKey: string;
  secretAccessKey: string;
}

export interface BuildConnectionAndConfigOptions {
  url: string;
  cleanup: () => any
}

export interface ConnectionAndConfig {
  connection: AwsUtilsConnection;
  config: SimpleServiceConfigurationOptions;
}

export function buildConfigFromConnection(connection: AwsUtilsConnection): SimpleServiceConfigurationOptions;
export function buildConnectionAndConfig(options: BuildConnectionAndConfigOptions): ConnectionAndConfig;
export function waitForReady(awsType: string, retryFunc: () => Promise<any>, options: OperationOptions): Promise<void>;
