import {AxiosRequestConfig, AxiosPromise} from "axios";
import Alpha = require('@lifeomic/alpha');
import {TestInterface} from "ava";
import Docker = require('dockerode');

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
  container?: string;
}

export interface LambdaExecutionEnvironment {
  network?: Docker.Network;
  container?: Docker.Container;
  cleanupMountpoint?: () => Promise<void>;
}

export interface DestroyLambdaExecutionEnvironmentOptions {
  cleanupMountpoint?: boolean;
  container?: Docker.Container;
  network?: Docker.Network;
}

export interface AlphaClientConfig {
  container: Docker.Container;
  environment: {[key: string]: any};
  handler: string;
}

export class LambdaAlphaClient extends Alpha {
  constructor(config: AlphaClientConfig);
  raw<T = any>(event: any, environment: Environment, handler: string): Promise<T>;
  graphql<T = any>(
    path: string,
    query: any,
    variables: any,
    config?: AxiosRequestConfig
  ): AxiosPromise<T>
}

export interface LambdaTestContext {
  lambda: LambdaAlphaClient;
}

export interface TestHooks {
  beforeAll(): Promise<void>;
  afterAll(): Promise<void>;
  beforeEach(): Promise<LambdaAlphaClient>;
}

export class LambdaRunner {
  constructor(container: string, environment: Environment, handler: string)
  invoke(event: any): Promise<any>;
}

export function useLambda<T extends LambdaTestContext>(test: TestInterface<T>, options?: LocalOptions): void;
export function useLambdaHooks(options?: CreateLambdaExecutionEnvironmentOptions): TestHooks;
export function useNewContainer(options?: NewContainerOptions): void;
export function useComposeContainer(options?: ComposeContainerOptions): void;
export function build(options?: WebpackOptions): Promise<any>;
export function createLambdaExecutionEnvironment(options?: CreateLambdaExecutionEnvironmentOptions): Promise<LambdaExecutionEnvironment>;
export function destroyLambdaExecutionEnvironment(options?: DestroyLambdaExecutionEnvironmentOptions): Promise<void>;
