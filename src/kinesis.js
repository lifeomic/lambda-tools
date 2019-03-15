const AWS = require('aws-sdk');

exports.useKinesis = (test, streamName) => {
  const kinesis = new AWS.Kinesis({
    endpoint: process.env.KINESIS_ENDPOINT
  });

  (test.serial || test).before(async () => {
    await kinesis.createStream({
      ShardCount: 1,
      StreamName: streamName
    }).promise();
  });

  (test.serial || test).beforeEach(function (test) {
    test.context.kinesis = kinesis;
  });

  (test.serial || test).after(async () => {
    await kinesis.deleteStream({
      StreamName: streamName
    });
  });
};
