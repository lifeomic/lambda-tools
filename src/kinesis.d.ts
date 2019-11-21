import {Kinesis} from "aws-sdk";
import {TestInterface} from "ava";
import {ConnectionAndConfig, SimpleServiceConfigurationOptions} from "./utils/awsUtils";

import * as kinesisTools from './utils/kinesisTools';

export { kinesisTools };

export interface KinesisContext {
  kinesisClient: Kinesis;
  config: SimpleServiceConfigurationOptions;
  streamNames: {[key: string]: string};
  uniqueIdentifier: string;
}

export interface KinesisTestContext {
  kinesis: KinesisContext;
}

export interface UseKinesisContext {
  kinesis: Kinesis;
}

export interface Hooks {
  beforeAll(): Promise<void>;
  beforeEach(): Promise<KinesisContext>;
  afterEach(context: KinesisContext): Promise<void>;
  afterAll(): Promise<void>;
}

export function kinesisTestHooks(useUniqueStreams?: boolean): Hooks;
export function useKinesisDocker<T extends KinesisTestContext>(test: TestInterface<T>, useUniqueStreams?: boolean): void;
export function useKinesis<T extends UseKinesisContext>(test: TestInterface<T>, streamName: string): void;
export function streams(streams: ReadonlyArray<string>): void;
export function createStreams(kinesisClient: Kinesis, uniqueIdentifier?: string): Promise<void>;
export function destroyStreams(kinesisClient: Kinesis, uniqueIdentifier?: string): Promise<void>;
export function getConnnection(): Promise<ConnectionAndConfig>;
