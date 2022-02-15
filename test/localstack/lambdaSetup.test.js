const test = require('ava');
const path = require('path');
const { v4: uuid } = require('uuid');
const fs = require('fs-extra');
const sinon = require('sinon');

const { KinesisIterator } = require('../../src/utils/kinesisTools');

const { createStreams, destroyStreams, streams } = require('../../src/kinesis');
const { useLocalStack } = require('../../src/localstack');
const { FIXTURES_DIRECTORY, buildLambda } = require('../helpers/lambda');
const streamNames = ['first-stream', 'second-stream'];
streams(streamNames);

useLocalStack(test, { services: ['lambda', 'kinesis'], versionTag: '0.14.0' });
const handlerName = 'ts_lambda_kinesisHandler';

const BUILD_DIRECTORY = path.join(FIXTURES_DIRECTORY, 'build', uuid());

const sleep = (seconds) => new Promise((resolve) => setTimeout(resolve, seconds * 1000));

test.before(async () => {
  await buildLambda(BUILD_DIRECTORY, `${handlerName}.ts`, { zip: true });
});

test.serial.beforeEach(async (t) => {
  const { localStack: { services: { lambda, kinesis } } } = t.context;

  await createStreams(kinesis.client);

  await lambda.client.createFunction({
    Code: {
      ZipFile: fs.readFileSync(path.join(BUILD_DIRECTORY, `${handlerName}.js.zip`)),
    },
    FunctionName: handlerName,
    Runtime: 'nodejs12.x',
    Handler: `${handlerName}.handler`,
    MemorySize: 1024,
    Role: 'arn:aws:iam::123456789012:role/service-role/role-name',
    Publish: true,
    Environment: {
      Variables: {
        NEXT_KINESIS_STREAM_NAME: streamNames[1],
        AWS_SECRET_ACCESS_KEY: uuid(),
        AWS_ACCESS_KEY_ID: uuid(),
      },
    },
  }).promise();

  const { StreamDescription: { StreamARN } } = await kinesis.client.describeStream({ StreamName: streamNames[0] }).promise();

  await lambda.client.createEventSourceMapping({
    EventSourceArn: StreamARN,
    FunctionName: handlerName,
    BatchSize: 10,
    Enabled: true,
    StartingPosition: 'TRIM_HORIZON',
  }).promise();
});

test.afterEach(async (t) => {
  const { localStack: { services: { lambda, kinesis } } } = t.context;
  await destroyStreams(kinesis.client);
  await lambda.client.deleteFunction({ FunctionName: handlerName }).promise();
});

test.after.always(async () => {
  await fs.remove(BUILD_DIRECTORY);
});

function formatRecords (StreamName, records) {
  return {
    Records: records.map((record) => ({
      Data: Buffer.from(JSON.stringify(record)),
      PartitionKey: uuid(),
    })),
    StreamName,
  };
}

test.serial('can iterate through stream to handler', async (t) => {
  const { localStack: { services: { kinesis: { client: kinesisClient } } } } = t.context;
  const expected = [...Array(20)].map(() => ({ key: uuid() }));

  await kinesisClient.putRecords(formatRecords(streamNames[0], expected)).promise();
  const secondIterator = await KinesisIterator.newIterator({ kinesisClient, streamName: streamNames[1] });

  let records = [];
  let attempts = 0;
  while (records.length === 0 && attempts++ < 20) {
    await secondIterator.next();
    records = secondIterator.records;
    await sleep(1);
  }

  const actual = await records.map(({ Data }) => {
    const base64 = Buffer.from(Data, 'base64');
    const utf8 = base64.toString('utf8');
    return JSON.parse(utf8);
  });
  sinon.assert.match(actual, expected);
});
