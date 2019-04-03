import * as aws from "aws-sdk";

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
