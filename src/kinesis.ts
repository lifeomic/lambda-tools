import AWS from 'aws-sdk';
import { v4 as uuid } from 'uuid';
import Docker from 'dockerode';
import cloneDeep from 'lodash/cloneDeep';

import * as tools from './utils/kinesisTools';

import { getHostAddress, ensureImage } from './docker';
import { Environment } from './Environment';
import { AwsUtilsConnection, buildConnectionAndConfig, ConfigurationOptions, waitForReady } from './utils/awsUtils';
import { localstackReady } from './localstack';
import { getLogger } from './utils/logging';
import { pQueue } from './utils/config';
import { TestInterface } from 'ava';

const logger = getLogger('kinesis');

const KINESIS_IMAGE = 'localstack/localstack:0.12.2';

export { tools };

export type MappedStreamNames<KeyArray extends string[]> = {[Key in KeyArray[number]]: string}

export interface KinesisContext<KeyArray extends string[]> {
  kinesisClient: AWS.Kinesis;
  config: ConfigurationOptions;
  streamNames: MappedStreamNames<KeyArray>;
  uniqueIdentifier: string;
}

export interface KinesisTestContext<KeyArray extends string[]> {
  kinesis: KinesisContext<KeyArray>;
}

export interface UseKinesisContext {
  kinesis: AWS.Kinesis;
  kinesisContext: KinesisContext<string[]>;
}

export interface KinesisStreamInfo<Name extends string = string> {
  StreamName: Name;
  ShardCount: number;
}

export type KinesisStreams<KeyArray extends string[] = string[]> = KinesisStreamInfo<KeyArray[number]>[];

const kinesisStreams: KinesisStreams = [];

export function streams (streams: string[]) {
  kinesisStreams.length = 0;
  kinesisStreams.push(...streams.map(StreamName => ({
    StreamName,
    ShardCount: 1
  })));
}

function getStreamName (streamName: string, uniqueIdentifier: string) {
  return uniqueIdentifier ? `${streamName}-${uniqueIdentifier}` : streamName;
}

export async function destroyStreams (
  kinesisClient: AWS.Kinesis,
  uniqueIdentifier: string,
  streams: KinesisStreams = kinesisStreams,
): Promise<void> {
  const failedDeletions: string[] = [];
  const { StreamNames } = await kinesisClient.listStreams().promise();
  const streamNames = streams
    .map(({ StreamName }) => getStreamName(StreamName, uniqueIdentifier));
  const streamsToDestroy = StreamNames
    .filter(name => streamNames.includes(name));

  await pQueue.addAll(
    streamsToDestroy
      .map(StreamName => async () => {
        try {
          await kinesisClient.deleteStream({ StreamName }).promise();
          await kinesisClient.waitFor('streamNotExists', { StreamName }).promise();
        } catch (err) {
          failedDeletions.push(StreamName);
          logger.error(`Failed to destroy stream "${StreamName}"`, err);
        }
      })
  );

  if (failedDeletions.length) {
    throw new Error(`Failed to destroy streams: ${failedDeletions.join(', ')}`);
  }
}

export async function createStreams (
  kinesisClient: AWS.Kinesis,
  uniqueIdentifier: string,
  streams: KinesisStreams = kinesisStreams,
): Promise<void> {
  const failedProvisons: string[] = [];
  await pQueue.addAll(
    streams.map(stream => async () => {
      const newStream = cloneDeep(stream);
      const StreamName = getStreamName(newStream.StreamName, uniqueIdentifier);
      newStream.StreamName = StreamName;

      try {
        await kinesisClient.createStream(newStream).promise();
        await kinesisClient.waitFor('streamExists', { StreamName }).promise();
      } catch (err) {
        failedProvisons.push(StreamName);
        logger.error(`Failed to create stream "${StreamName}"`, err);
      }
    })
  );

  if (failedProvisons.length) {
    try {
      await destroyStreams(kinesisClient, uniqueIdentifier);
    } catch (err) {
      logger.error('Failed to destroy streams after create failed', err);
    }
    throw new Error(`Failed to create streams: ${failedProvisons.join(', ')}`);
  }
}

function buildStreamNameMapping<KeyArray extends string[]> (
  uniqueIdentifier: string,
  streams: KinesisStreams<KeyArray> = kinesisStreams,
): MappedStreamNames<KeyArray> {
  return streams.reduce<MappedStreamNames<KeyArray>>((acc, { StreamName }) => {
    acc[StreamName] = getStreamName(StreamName, uniqueIdentifier);
    return acc;
  }, {} as MappedStreamNames<KeyArray>);
}

export async function getConnection () {
  if (process.env.KINESIS_ENDPOINT) {
    return buildConnectionAndConfig({ url: process.env.KINESIS_ENDPOINT });
  }

  const docker = new Docker();
  const environment = new Environment();

  await ensureImage(docker, KINESIS_IMAGE);

  const localstackPort = `${process.env.LAMBDA_TOOLS_LOCALSTACK_PORT || 4566}`;

  const container = await docker.createContainer({
    HostConfig: {
      AutoRemove: true,
      PublishAllPorts: true
    },
    ExposedPorts: { [`${localstackPort}/tcp`]: {} },
    Image: KINESIS_IMAGE,
    Env: [
      'SERVICES=kinesis'
    ]
  });

  await container.start();
  const promise = localstackReady(container);

  const containerData = await container.inspect();
  const host = await getHostAddress();
  const port = containerData.NetworkSettings.Ports[`${localstackPort}/tcp`][0].HostPort;
  const url = `http://${host}:${port}`;

  environment.set('AWS_ACCESS_KEY_ID', 'bogus');
  environment.set('AWS_SECRET_ACCESS_KEY', 'bogus');
  environment.set('AWS_REGION', 'us-east-1');
  environment.set('KINESIS_ENDPOINT', url);

  const { config, connection } = buildConnectionAndConfig({
    cleanup: () => {
      environment.restore();
      return container.stop();
    },
    url
  });

  await promise;
  const kinesisClient = new AWS.Kinesis(config);
  await waitForReady('Kinesis', async () => kinesisClient.listStreams().promise());

  return { connection, config };
}

export interface UseKinesisHooks<KeyArray extends string[] = string[]> {
  before: () => Promise<KinesisContext<KeyArray>>;
  after: (context: KinesisContext<KeyArray>) => Promise<void>;
}

export function useKinesisHooks<KeyArray extends string[] = string[]>(
  useUniqueStreams = false,
  streams: KinesisStreams<KeyArray> = kinesisStreams,
  config: ConfigurationOptions = {}
): UseKinesisHooks {
  return {
    async before() {
      const uniqueIdentifier = useUniqueStreams ? uuid() : '';
      const service = new AWS.Kinesis(config);
      await createStreams(service, uniqueIdentifier, streams);
      return {
        kinesisClient: service,
        config,
        streamNames: buildStreamNameMapping(uniqueIdentifier),
        uniqueIdentifier
      };
    },
    async after(context: KinesisContext<KeyArray>) {
      if (!context) {
        return;
      }
      const { kinesisClient, uniqueIdentifier } = context;
      await destroyStreams(kinesisClient, uniqueIdentifier, streams);
    },
  }
}

export interface KinesisTestHooks<KeyArray extends string[]> {
  beforeAll(): Promise<void>;
  beforeEach(): Promise<KinesisContext<KeyArray>>;
  afterEach(context: KinesisContext<KeyArray>): Promise<void>;
  afterAll(): Promise<void>;
}

export function kinesisTestHooks <KeyArray extends string[]>(
  useUniqueStreams = false,
  streams: KinesisStreams<KeyArray> = kinesisStreams
): KinesisTestHooks<KeyArray> {
  let connection: AwsUtilsConnection;
  let config: ConfigurationOptions;

  async function beforeAll () {
    const result = await getConnection();
    connection = result.connection;
    config = result.config;
  }

  async function beforeEach (): Promise<KinesisContext<KeyArray>> {
    const uniqueIdentifier = useUniqueStreams ? uuid() : '';
    const service = new AWS.Kinesis(config);
    await createStreams(service, uniqueIdentifier, streams);
    return {
      kinesisClient: service,
      config,
      streamNames: buildStreamNameMapping(uniqueIdentifier),
      uniqueIdentifier
    };
  }

  async function afterEach (context: KinesisContext<KeyArray>) {
    if (!context) {
      return;
    }
    const { kinesisClient, uniqueIdentifier } = context;
    await destroyStreams(kinesisClient, uniqueIdentifier, streams);
  }

  async function afterAll () {
    // If the beforeAll block executed long enough to set a connection,
    // then it should be cleaned up
    if (connection) {
      await connection.cleanup();
    }
  }

  return {
    beforeAll, beforeEach, afterEach, afterAll
  };
}

export function useKinesisDocker (anyTest: TestInterface, useUniqueStreams?: boolean) {
  const test = anyTest as TestInterface<KinesisTestContext<any>>;
  const testHooks = kinesisTestHooks(useUniqueStreams);

  test.serial.before(testHooks.beforeAll);

  test.serial.beforeEach(async (t) => {
    t.context.kinesis = await testHooks.beforeEach();
  });

  test.serial.afterEach.always(async t => {
    await testHooks.afterEach(t.context.kinesis);
  });

  test.serial.after.always(testHooks.afterAll);
}

export function useKinesis (anyTest: TestInterface, StreamName: string) {
  // The base ava test doesn't have context, and has to be cast.
  // This allows clients to send in the default ava export, and they can cast later or before.
  const test = anyTest as TestInterface<UseKinesisContext>;
  const hooks = useKinesisHooks(false, [ {
    StreamName,
    ShardCount: 1,
  }], {

  });

  test.serial.before(async t => {
    const context = await hooks.before();
    t.context.kinesis = context.kinesisClient;
    t.context.kinesisContext = context;
  });

  test.serial.after(async t => {
    await hooks.after(t.context.kinesisContext);
  });
}
