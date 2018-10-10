const AWS = require('aws-sdk');

exports.useKinesis = (test, streamName) => {
  const kinesis = new AWS.Kinesis({
    endpoint: process.env.KINESIS_ENDPOINT
  });

  test.before(async () => {
    await kinesis.createStream({
      ShardCount: 1,
      StreamName: streamName
    }).promise();
  });

  test.beforeEach(function (test) {
    test.context.kinesis = kinesis;
  });

  test.after(async () => {
    await kinesis.deleteStream({
      StreamName: streamName
    });
  });
};
