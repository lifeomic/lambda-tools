const { tableSchema } = require('@lifeomic/lambda-tools').dynamodb;

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
