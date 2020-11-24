import assert from 'assert';
import { Kinesis } from "aws-sdk";
import {Callback, Context, KinesisStreamHandler, KinesisStreamRecord} from "aws-lambda";

export interface BasicKinesisConfig {
  kinesisClient: Kinesis;
  streamName: string;
}

export interface LambdaTriggerConfig{
  lambdaHandler: KinesisStreamHandler;
  kinesisIterator: KinesisIterator;
  limit?: number;
  context?: Context;
  callback?: Callback<void>;
}

class KinesisIterator {
  static async newIterator (config: BasicKinesisConfig) {
    const iterator = new KinesisIterator(config);
    await iterator.init();
    return iterator;
  }

  private _kinesis: Kinesis;
  private _streamName: string;
  private _shardIterator: string | undefined;
  private _getRecordsResponse: Kinesis.GetRecordsOutput | undefined;

  constructor ({ kinesisClient, streamName }: BasicKinesisConfig) {
    assert.ok(kinesisClient, 'kinesisClient client needs to be provided');
    assert.ok(kinesisClient.getRecords && kinesisClient.describeStream && kinesisClient.getShardIterator, 'kinesisClient client needs to be of type AWS.Kinesis');
    assert.ok(typeof streamName === 'string', 'streamName needs to be defined and a string');

    this._kinesis = kinesisClient;
    this._streamName = streamName;
  }

  async init () {
    const describeStreamResult = await this._kinesis.describeStream({
      StreamName: this._streamName
    }).promise();

    const getShardIteratorResult = await this._kinesis.getShardIterator({
      ShardId: describeStreamResult.StreamDescription.Shards[0].ShardId,
      ShardIteratorType: 'TRIM_HORIZON',
      StreamName: this._streamName
    }).promise();

    this._shardIterator = getShardIteratorResult.ShardIterator;
    return this;
  }

  async next (Limit?: Kinesis.GetRecordsInputLimit) {
    if (!this._shardIterator) {
      await this.init();
    }
    this._getRecordsResponse = await this._kinesis.getRecords({
      ShardIterator: this._shardIterator!,
      Limit
    }).promise();
    this._shardIterator = this._getRecordsResponse.NextShardIterator;
    return this;
  }

  get records () {
    return this._getRecordsResponse?.Records;
  }

  get response () {
    return this._getRecordsResponse;
  }
}

async function getStreamRecords (config: BasicKinesisConfig) {
  const kinesisIterator = await KinesisIterator.newIterator(config);
  await kinesisIterator.next();
  return kinesisIterator.records;
}

function createLambdaEvent (records: Kinesis.RecordList): KinesisStreamRecord[] {
  return records.map(record => ({
    eventID: `shardId-000000000000:${record.SequenceNumber}`,
    eventVersion: '1.0',
    kinesis: {
      approximateArrivalTimestamp: Date.now(),
      partitionKey: record.PartitionKey,
      data: record.Data.toString('base64'),
      kinesisSchemaVersion: '1.0',
      sequenceNumber: record.SequenceNumber
    },
    invokeIdentityArn: 'some-arn',
    eventName: 'aws:kinesis:record',
    eventSourceARN: 'some-arn',
    eventSource: 'aws:kinesis',
    awsRegion: 'us-east-1'
  }));
}

/**
 * @param lambdaHandler A {function} used to interact with the lambda instance;
 * @param kinesisIterator A {KinesisIterator} to get records from the stream.
 * @param context A {Context} to pass to the lambda handler.
 * @param callback A {CallBack<void>} function to pass to the lambda handler.
 * @param limit An optional limit to the number of records in each iterator batch.
 * @returns {Promise<{processedRecordCount}>}
 */
async function kinesisLambdaTrigger ({
  lambdaHandler,
  kinesisIterator,
  limit,
  context,
  callback
}: LambdaTriggerConfig): Promise<{
  processedRecordCount: number;
}> {
  assert.ok(lambdaHandler, 'No lambdaHandler provided');
  assert.ok(typeof lambdaHandler === 'function', 'lambdaHandler needs to be a function');
  assert.ok(typeof kinesisIterator.next === 'function', 'kinesisIterator needs to be of type KinesisIterator');

  let processedRecordCount = 0;

  let hadRecords = true;
  while (hadRecords) {
    hadRecords = false;
    const eventRecords = (await kinesisIterator.next(limit)).records!;
    processedRecordCount += eventRecords.length;
    if (eventRecords.length > 0) {
      hadRecords = true;
      const Records = createLambdaEvent(eventRecords);
      await lambdaHandler({ Records }, context!, callback!);
    }
  }
  return {
    processedRecordCount
  };
}

module.exports = {
  KinesisIterator,
  getStreamRecords,
  createLambdaEvent,
  kinesisLambdaTrigger
};
