const test = require('ava');

const { useDynamoDB } = require('@lifeomic/lambda-tools').dynamodb;

useDynamoDB(test);

test.serial('A DynamoDB table is provisioned', async (test) => {
  const items = [
    { name: 'alice', age: 35 },
    { name: 'bob', age: 38 }
  ];

  // Insert all items into the databes
  await Promise.all(
    items.map((item) => test.context.dynamodb.documentClient.put({
      Item: item,
      TableName: 'testers'
    }).promise())
  );

  // Get all items in the database
  const results = await test.context.dynamodb.documentClient.scan({ TableName: 'testers' }).promise();

  test.deepEqual(results.Items, items);
});
