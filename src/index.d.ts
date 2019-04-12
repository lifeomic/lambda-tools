import * as aws from "aws-sdk";
import * as docker from "dockerode";

declare namespace dynamodb {
  export interface Context {
    documentClient: aws.DynamoDB.DocumentClient;
    dynamoClient: aws.DynamoDB;
    streamsClient: aws.DynamoDBStreams;
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
}

declare namespace lambda {
  interface Environment {
    [key:string]: string;
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
    zip?: string;
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
    container?: docker.Container;
    cleanupMountpoint?: () => Promise<void>;
  }

  interface DestroyLambdaExecutionEnvironmentOptions {
    cleanupMountpoint?: boolean;
    container?: boolean;
    network?: boolean;
  }

  export function useLambda(test: any, options: LocalOptions): void;
  export function useNewContainer(options: NewContainerOptions): void;
  export function useComposeContainer(options: ComposeContainerOptions): void;
  export function webpack(options: WebpackOptions): Promise<any>;
  export function createLambdaExecutionEnvironment(options: CreateLambdaExecutionEnvironmentOptions): Promise<LambdaExecutionEnvironment>;
  export function destroyLambdaExecutionEnvironment(options: DestroyLambdaExecutionEnvironmentOptions): Promise<Void>;
}
