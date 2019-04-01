import * as aws from "aws-sdk";
import { TestInterface } from "ava";

namespace dynamodb {
  export interface DynamoDBContext {
    documentClient: aws.DynamoDB.DocumentClient;
    dynamoClient: aws.DynamoDB;
    streamsClient: aws.DynamoDBStreams;
  }

  export interface DynamoDBHooks {
    beforeAll(): Promise<void>;
    beforeEach(): Promise<DynamoDBContext>;
    afterEach(context: DynamoDBContext): Promise<void>;
    afterAll(): Promise<void>;
  }

  export function tableSchema(
    schema: ReadonlyArray<aws.DynamoDB.Types.CreateTableInput>
  );
  export function dynamoDBTestHooks(useUniqueTables: boolean);
  export function useDynamoDB(test: TestInterface): void;
}
