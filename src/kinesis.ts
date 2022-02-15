import AWS from 'aws-sdk';
import { v4 as uuid } from 'uuid';
import Docker from 'dockerode';
import cloneDeep from 'lodash/cloneDeep';
import fromPairs from 'lodash/fromPairs';

import * as tools from './utils/kinesisTools';

import { getHostAddress, ensureImage } from './docker';
import { Environment } from './Environment';
import { AwsUtilsConnection, buildConnectionAndConfig, ConfigurationOptions, waitForReady } from './utils/awsUtils';
import { localstackReady } from './localstack';
import { getLogger } from './utils/logging';
import { pQueue } from './utils/config';
import { TestInterface } from 'ava';

const logger = getLogger('kinesis');

const KINESIS_IMAGE = 'localstack/localstack:0.14.0';

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
}

const kinesisStreams: { StreamName: string; ShardCount: number }[] = [];

export function streams (streams: string[]) {
  kinesisStreams.length = 0;
  kinesisStreams.push(...streams.map((StreamName) => ({
    StreamName,
    ShardCount: 1,
  })));
}

function getStreamName (streamName: string, uniqueIdentifier: string) {
  return uniqueIdentifier ? `${streamName}-${uniqueIdentifier}` : streamName;
}

export async function destroyStreams (kinesisClient: AWS.Kinesis, uniqueIdentifier: string): Promise<void> {
  const failedDeletions: string[] = [];
  const { StreamNames } = await kinesisClient.listStreams().promise();
  const streamNames = kinesisStreams
    .map(({ StreamName }) => getStreamName(StreamName, uniqueIdentifier));
  const streamsToDestroy = StreamNames
    .filter((name) => streamNames.includes(name));

  await pQueue.addAll(
    streamsToDestroy
      .map((StreamName) => async () => {
        try {
          await kinesisClient.deleteStream({ StreamName }).promise();
          await kinesisClient.waitFor('streamNotExists', { StreamName }).promise();
        } catch (err) {
          failedDeletions.push(StreamName);
          logger.error(`Failed to destroy stream "${StreamName}"`, err);
        }
      }),
  );

  if (failedDeletions.length) {
    throw new Error(`Failed to destroy streams: ${failedDeletions.join(', ')}`);
  }
}

export async function createStreams (kinesisClient: AWS.Kinesis, uniqueIdentifier: string): Promise<void> {
  const failedProvisons: string[] = [];
  await pQueue.addAll(
    kinesisStreams.map((stream) => async () => {
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
    }),
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

function buildStreamNameMapping (uniqueIdentifier: string) {
  return fromPairs(kinesisStreams.map(({ StreamName }) => {
    return [StreamName, getStreamName(StreamName, uniqueIdentifier)];
  }));
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
      PublishAllPorts: true,
    },
    ExposedPorts: { [`${localstackPort}/tcp`]: {} },
    Image: KINESIS_IMAGE,
    Env: [
      'SERVICES=kinesis',
    ],
  });

  await container.start();

  const containerData = await container.inspect();
  const promise = localstackReady(container, containerData);
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
    url,
  });

  await promise;
  const kinesisClient = new AWS.Kinesis(config);
  await waitForReady('Kinesis', async () => kinesisClient.listStreams().promise());

  return { connection, config };
}

export function kinesisTestHooks <KeyArray extends string[]>(useUniqueStreams?: boolean) {
  let connection: AwsUtilsConnection;
  let config: ConfigurationOptions;

  async function beforeAll () {
    const result = await getConnection();
    connection = result.connection;
    config = result.config;
  }

  async function beforeEach () {
    const uniqueIdentifier = useUniqueStreams ? uuid() : '';
    const service = new AWS.Kinesis(config);
    await createStreams(service, uniqueIdentifier);
    return {
      kinesisClient: service,
      config,
      streamNames: buildStreamNameMapping(uniqueIdentifier),
      uniqueIdentifier,
    };
  }

  async function afterEach (context: KinesisContext<KeyArray>) {
    if (!context) {
      return;
    }
    const { kinesisClient, uniqueIdentifier } = context;
    await destroyStreams(kinesisClient, uniqueIdentifier);
  }

  async function afterAll () {
    // If the beforeAll block executed long enough to set a connection,
    // then it should be cleaned up
    if (connection) {
      await connection.cleanup();
    }
  }

  return {
    beforeAll, beforeEach, afterEach, afterAll,
  };
}

export function useKinesisDocker (anyTest: TestInterface, useUniqueStreams?: boolean) {
  const test = anyTest as TestInterface<KinesisTestContext<any>>;
  const testHooks = kinesisTestHooks<any>(useUniqueStreams);

  test.serial.before(testHooks.beforeAll);

  test.serial.beforeEach(async (t) => {
    t.context.kinesis = await testHooks.beforeEach();
  });

  test.serial.afterEach.always(async (t) => {
    await testHooks.afterEach(t.context.kinesis);
  });

  test.serial.after.always(testHooks.afterAll);
}

export function useKinesis (anyTest: TestInterface, streamName: string) {
  // The base ava test doesn't have context, and has to be cast.
  // This allows clients to send in the default ava export, and they can cast later or before.
  const test = anyTest as TestInterface<UseKinesisContext>;
  const kinesis = new AWS.Kinesis({
    endpoint: process.env.KINESIS_ENDPOINT,
  });

  test.serial.before(async () => {
    await kinesis.createStream({
      ShardCount: 1,
      StreamName: streamName,
    }).promise();
  });

  test.serial.beforeEach((t) => {
    t.context.kinesis = kinesis;
  });

  test.serial.after(async () => {
    await kinesis.deleteStream({
      StreamName: streamName,
    }).promise();
  });
}
