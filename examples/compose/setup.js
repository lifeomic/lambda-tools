const path = require('path');

const { tableSchema } = require('@lifeomic/lambda-tools').dynamodb;
const { useNewContainer } = require('@lifeomic/lambda-tools').lambda;

tableSchema([
  {
    AttributeDefinitions: [
      {
        AttributeName: 'name',
        AttributeType: 'S'
      },
      {
        AttributeName: 'age',
        AttributeType: 'N'
      }
    ],
    KeySchema: [
      {
        AttributeName: 'name',
        KeyType: 'HASH'
      },
      {
        AttributeName: 'age',
        KeyType: 'RANGE'
      }
    ],
    ProvisionedThroughput: {
      ReadCapacityUnits: 1,
      WriteCapacityUnits: 1
    },
    TableName: 'testers'
  }
]);

useNewContainer({
  environment: {
    DYNAMODB_ENDPOINT: process.env.DYNAMODB_ENDPOINT
  },
  handler: 'lambda.handler',
  mountpoint: process.env.MOUNTPOINT,
  useComposeNetwork: true
});
