import {Kinesis} from 'aws-sdk';
import {KinesisStreamRecord, KinesisStreamEvent} from 'aws-lambda';

export interface BasicKinesisConfig {
  kinesisClient: Kinesis;
  streamName: string;
}

export class KinesisIterator {
  static newIterator(config: BasicKinesisConfig): Promise<KinesisIterator>;

  public records: Kinesis.RecordList;

  public response: Kinesis.GetRecordsOutput;

  constructor(config: BasicKinesisConfig);

  init(): Promise<KinesisIterator>;

  next(Limit?: Kinesis.GetRecordsInputLimit): Promise<KinesisIterator>;
}

export function getStreamRecords(options: BasicKinesisConfig): Kinesis.RecordList;

export function createLambdaEvent(records: Kinesis.RecordList): KinesisStreamRecord;

export type lambdaHandler =  <T> (event: KinesisStreamEvent) => Promise<T>;

export interface LambdaTriggerConfig {
  lambdaHandler: lambdaHandler;
  kinesisIterator?: KinesisIterator;
  limit?: number;
}

export interface LambdTriggerStatistics {
  processedRecordCount: number;
}

export function kinesisLambdaTrigger(config: LambdaTriggerConfig): Promise<LambdTriggerStatistics>;
