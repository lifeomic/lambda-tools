const AWS = require('aws-sdk');
const test = require('ava');
const uuid = require('uuid');

const { streams, useKinesisDocker } = require('../../src/kinesis');

useKinesisDocker(test, true);

test.before(() => {
  streams(['test-stream']);
});

test.after(() => {
  streams([]);
});

test('The helper provides kinesis client and streams', async (test) => {
  const { streamNames, kinesisClient } = test.context.kinesis;
  test.true(kinesisClient instanceof AWS.Kinesis);

  const listStreamsResponse = await kinesisClient.listStreams().promise();
  const streamName = streamNames['test-stream'];
  test.true(listStreamsResponse.StreamNames.includes(streamName));

  const item = {
    id: 'test',
    message: 'hello'
  };

  await kinesisClient.putRecord({
    Data: JSON.stringify(item),
    StreamName: streamName,
    PartitionKey: uuid()
  }).promise();

  const describeStream = await kinesisClient.describeStream({
    StreamName: streamName
  }).promise();

  const iterator = await kinesisClient.getShardIterator({
    ShardId: describeStream.StreamDescription.Shards[0].ShardId,
    ShardIteratorType: 'TRIM_HORIZON',
    StreamName: streamName,
    Timestamp: Date.now()
  }).promise();

  const results = await kinesisClient.getRecords({
    ShardIterator: iterator.ShardIterator,
    Limit: 10e3
  }).promise();

  test.is(results.Records.length, 1);
  const payload = Buffer.from(results.Records[0].Data, 'base64').toString(
    'utf8'
  );

  test.deepEqual(JSON.parse(payload), item);
});

test('The helper includes a unique identifier in the stream names', async (test) => {
  const { streamNames, uniqueIdentifier } = test.context.kinesis;
  const streamName = streamNames['test-stream'];

  test.true(typeof uniqueIdentifier === 'string');
  test.true(uniqueIdentifier.length > 0);
  test.is(streamName, `test-stream-${uniqueIdentifier}`);
});

test('The helper sets default configuration environment variables', async (test) => {
  test.truthy(process.env.AWS_ACCESS_KEY_ID);
  test.truthy(process.env.AWS_SECRET_ACCESS_KEY);
  test.truthy(process.env.AWS_REGION);
  test.truthy(process.env.KINESIS_ENDPOINT);
});

test('The helper provides a config object', async (test) => {
  const { config } = test.context.kinesis;

  test.true(config.credentials instanceof AWS.Credentials);
  test.true(config.endpoint instanceof AWS.Endpoint);
  test.truthy(config.region);
});
