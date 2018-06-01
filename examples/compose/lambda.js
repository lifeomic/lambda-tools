const AWS = require('aws-sdk');

exports.handler = async (event, context, callback) => {
  try {
    const dynamodb = new AWS.DynamoDB({
      endpoint: process.env.DYNAMODB_ENDPOINT
    });

    const result = await dynamodb.listTables().promise();
    callback(null, result.TableNames);
  } catch (error) {
    callback(error);
  }
};
