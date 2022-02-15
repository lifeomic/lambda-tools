import anyTest, {TestFn} from 'ava';
import {DynamoDB} from "aws-sdk";
import {DynamoDBTestContext, tableSchema, useDynamoDB} from '../../src/dynamodb'
import { TestFn } from 'ava/types/test-fn';

const test = anyTest as TestFn<DynamoDBTestContext<['test1', 'test2']>>;

const tableSchemas: DynamoDB.CreateTableInput[] = [
  {
    TableName: 'test1',
    AttributeDefinitions: [{
      AttributeName: 'key',
      AttributeType: 'S'
    }],
    KeySchema: [{
      AttributeName: 'key',
      KeyType: 'HASH'
    }],
    ProvisionedThroughput: {
      ReadCapacityUnits: 1,
      WriteCapacityUnits: 1
    }
  },
  {
    TableName: 'test2',
    AttributeDefinitions: [{
      AttributeName: 'key',
      AttributeType: 'S'
    }],
    KeySchema: [{
      AttributeName: 'key',
      KeyType: 'HASH'
    }],
    ProvisionedThroughput: {
      ReadCapacityUnits: 1,
      WriteCapacityUnits: 1
    }
  },
];

tableSchema(tableSchemas);

useDynamoDB(anyTest);

test('testTypes', t => {
  const {dynamodb: {
    tableNames
  }} = t.context;

  t.is(tableNames.test1, 'test1');
  t.is(tableNames.test2, 'test2');

  // @ts-expect-error
  t.is(tableNames.test3, undefined);
});
