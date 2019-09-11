const AWS = require('aws-sdk');
const test = require('ava');
const uuid = require('uuid');

const { streams, useKinesisDocker } = require('../../src/kinesis');

useKinesisDocker(test);

test.before(() => {
  streams(['test-stream']);
});

test.after(() => {
  streams([]);
});

// no uuid in stream name (old way, basic regression test to ensure forward
// compatibility)
test.serial('The helper provides kinesis clients and streams', async (test) => {
  const { kinesisClient } = test.context.kinesis;
  test.true(kinesisClient instanceof AWS.Kinesis);

  const listStreamsResponse = await kinesisClient.listStreams().promise();
  const streamName = 'test-stream'; // no uuid-stream name lookup
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

test.serial('The helper does not include a unique identifier in the stream names', async (test) => {
  const { streamNames, uniqueIdentifier } = test.context.kinesis;
  const streamName = streamNames['test-stream'];

  test.true(typeof uniqueIdentifier === 'string');
  test.true(uniqueIdentifier.length === 0);
  test.is(streamName, 'test-stream');
});
