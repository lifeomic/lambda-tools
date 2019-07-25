const AWS = require('aws-sdk');
const uuid = require('uuid');
const Docker = require('dockerode');
const cloneDeep = require('lodash/cloneDeep');
const fromPairs = require('lodash/fromPairs');
const NestedError = require('nested-error-stacks');
const promiseRetry = require('promise-retry');

const { getHostAddress, ensureImage } = require('./docker');
const Environment = require('./Environment');

const KINESIS_IMAGE = 'localstack/localstack:latest';

let kinesisStreams = [];

function streams (streams) {
  kinesisStreams = streams.map(StreamName => ({
    StreamName,
    ShardCount: 1
  }));
}

function getStreamName (streamName, uniqueIdentifier) {
  return uniqueIdentifier ? `${streamName}-${uniqueIdentifier}` : streamName;
}

async function createStreams (kinesisClient, uniqueIdentifier) {
  const failedProvisons = [];
  await Promise.all(
    kinesisStreams.map(async stream => {
      const newStream = cloneDeep(stream);
      const StreamName = getStreamName(newStream.StreamName, uniqueIdentifier);
      newStream.StreamName = StreamName;

      try {
        await kinesisClient.createStream(newStream).promise();
        await kinesisClient.waitFor('streamExists', { StreamName }).promise();
      } catch (err) {
        failedProvisons.push(StreamName);
        console.error(`Failed to create stream "${StreamName}"`, err);
      }
    })
  );

  if (failedProvisons.length) {
    throw new Error(`Failed to create streams: ${failedProvisons.join(', ')}`);
  }
}

async function destroyStreams (kinesisClient, uniqueIdentifier) {
  const failedDeletions = [];
  const { StreamNames } = await kinesisClient.listStreams().promise();
  const streamNames = kinesisStreams
    .map(({ StreamName }) => getStreamName(StreamName, uniqueIdentifier));
  const streamsToDestroy = StreamNames
    .filter(name => streamNames.includes(getStreamName(name, uniqueIdentifier)));

  await Promise.all(
    streamsToDestroy
      .map(async StreamName => {
        try {
          await kinesisClient.deleteStream({ StreamName }).promise();
          await kinesisClient.waitFor('streamNotExists', { StreamName }).promise();
        } catch (err) {
          failedDeletions.push(StreamName);
          console.error(`Failed to destroy stream "${StreamName}"`, err);
        }
      })
  );

  if (failedDeletions.length) {
    throw new Error(`Failed to destroy streams: ${failedDeletions.join(', ')}`);
  }
}

function buildStreamNameMapping (uniqueIdentifier) {
  return fromPairs(kinesisStreams.map(({StreamName}) => {
    return [StreamName, getStreamName(StreamName, uniqueIdentifier)];
  }));
}

function buildConfigFromConnection (connection) {
  return {
    credentials: new AWS.Credentials(connection.accessKey, connection.secretAccessKey),
    endpoint: new AWS.Endpoint(connection.url),
    region: connection.region,
    httpOptions: {
      timeout: 3000
    },
    maxRetries: 3
  };
}

async function waitForKinesisToBeReady (kinesisClient) {
  await promiseRetry(async function (retry, retryNumber) {
    try {
      await kinesisClient.listStreams({Limit: 1}).promise();
    } catch (error) {
      retry(new NestedError(`Kinesis is still not ready after ${retryNumber} connection attempts`, error));
    }
  }, {factor: 1, minTimeout: 500, retries: 20});
}

async function getConnection () {
  if (process.env.KINESIS_ENDPOINT) {
    const connection = {
      accessKey: process.env.AWS_ACCESS_KEY_ID,
      cleanup: () => {},
      region: 'us-east-1',
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      url: process.env.KINESIS_ENDPOINT
    };
    const config = buildConfigFromConnection(connection);
    return {connection, config};
  }

  const docker = new Docker();
  const environment = new Environment();

  await ensureImage(docker, KINESIS_IMAGE);

  const container = await docker.createContainer({
    HostConfig: {
      AutoRemove: true,
      PublishAllPorts: true
    },
    ExposedPorts: { '4568/tcp': {} },
    Image: KINESIS_IMAGE,
    Env: [
      'SERVICES=kinesis'
    ]
  });

  await container.start();

  const containerData = await container.inspect();
  const host = await getHostAddress();
  const port = containerData.NetworkSettings.Ports['4568/tcp'][0].HostPort;

  const connection = {
    accessKey: 'bogus',
    cleanup: () => {
      environment.restore();
      return container.stop();
    },
    region: 'us-east-1',
    secretAccessKey: 'bogus',
    url: `http://${host}:${port}`
  };

  const config = buildConfigFromConnection(connection);
  const kinesisClient = new AWS.Kinesis(config);
  await waitForKinesisToBeReady(kinesisClient);

  environment.set('AWS_ACCESS_KEY_ID', connection.accessKey);
  environment.set('AWS_SECRET_ACCESS_KEY', connection.secretAccessKey);
  environment.set('AWS_REGION', connection.region);
  environment.set('KINESIS_ENDPOINT', connection.url);

  return {connection, config};
}

function kinesisTestHooks (useUniqueStreams) {
  let connection, config;
  let service;

  async function beforeAll () {
    const result = await getConnection();
    connection = result.connection;
    config = result.config;
  }

  async function beforeEach () {
    const uniqueIdentifier = useUniqueStreams ? uuid() : '';
    service = new AWS.Kinesis(config);
    await createStreams(service, uniqueIdentifier);
    return {
      kinesisClient: service,
      config,
      streamNames: buildStreamNameMapping(uniqueIdentifier),
      uniqueIdentifier
    };
  }

  async function afterEach (context) {
    const {kinesisClient, uniqueIdentifier} = context;
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
    beforeAll, beforeEach, afterEach, afterAll
  };
}

function useKinesisDocker (test, useUniqueStreams) {
  const testHooks = kinesisTestHooks(useUniqueStreams);

  test.before(testHooks.beforeAll);

  test.beforeEach(async (test) => {
    const context = await testHooks.beforeEach();
    test.context.kinesis = context;
  });

  test.afterEach.always(async test => {
    const context = test.context.kinesis;
    await testHooks.afterEach(context);
  });

  test.after.always(testHooks.afterAll);
}

function useKinesis (test, streamName) {
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
}

module.exports = {
  kinesisTestHooks,
  useKinesisDocker,
  useKinesis,
  streams,
  createStreams,
  destroyStreams,
  getConnection
};
