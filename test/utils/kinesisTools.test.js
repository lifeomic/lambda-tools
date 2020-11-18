const test = require('ava');
const path = require('path');
const { v4: uuid } = require('uuid');
const fs = require('fs-extra');
const sinon = require('sinon');

const { kinesisLambdaTrigger, KinesisIterator, getStreamRecords } = require('../../src/utils/kinesisTools');
const { useKinesisDocker, streams } = require('../../src/kinesis');
const { useLocalStack } = require('../../src/localstack');
const { FIXTURES_DIRECTORY, buildLambda } = require('../helpers/lambda');

streams(['first-stream', 'second-stream']);
useKinesisDocker(test);
useLocalStack(test, { services: ['lambda'], versionTag: '0.12.2' });

const handlerName = 'lambda_kinesis_handler';
const BUILD_DIRECTORY = path.join(FIXTURES_DIRECTORY, 'build', uuid());

// Ava's `serial` hook decorator needs to be used so that `useNewContainer` is
// executed before the useLambda hooks are executed
test.serial.before(async () => {
  await buildLambda(BUILD_DIRECTORY, `${handlerName}.js`, { zip: true });
});

test.serial.beforeEach(async t => {
  const { kinesis: { streamNames }, localStack: { services: { lambda } } } = t.context;
  const secondStream = streamNames['second-stream'];

  await lambda.client.createFunction({
    Code: {
      // eslint-disable-next-line security/detect-non-literal-fs-filename
      ZipFile: fs.readFileSync(path.join(BUILD_DIRECTORY, `${handlerName}.js.zip`))
    },
    FunctionName: handlerName,
    Runtime: 'nodejs12.x',
    Handler: `${handlerName}.handler`,
    MemorySize: 1024,
    Role: 'arn:aws:iam::123456789012:role/service-role/role-name',
    Publish: true,
    Environment: {
      Variables: {
        NEXT_KINESIS_STREAM_NAME: secondStream,
        KINESIS_ENDPOINT: process.env.KINESIS_ENDPOINT,
        AWS_SECRET_ACCESS_KEY: uuid(),
        AWS_ACCESS_KEY_ID: uuid()
      }
    }
  }).promise();

  Object.assign(t.context, {
    firstStream: streamNames['first-stream'],
    secondStream
  });
});

test.afterEach.always(async t => {
  const { localStack: { services: { lambda } } } = t.context;
  await lambda.client.deleteFunction({ FunctionName: handlerName }).promise();
});

test.after.always(async t => {
  await fs.remove(BUILD_DIRECTORY);
});

function formatRecords (StreamName, records) {
  return {
    Records: records.map(record => ({
      Data: Buffer.from(JSON.stringify(record)),
      PartitionKey: uuid()
    })),
    StreamName
  };
}

test.serial('can get stream records using getStreamRecords function', async t => {
  const { kinesis: { kinesisClient }, firstStream } = t.context;
  const expected = [...Array(20)].map(() => ({ key: uuid() }));

  await kinesisClient.putRecords(formatRecords(firstStream, expected)).promise();
  const records = await getStreamRecords({ kinesisClient, streamName: firstStream });

  const actual = records.map(({ Data }) => {
    const base64 = Buffer.from(Data, 'base64');
    const utf8 = base64.toString('utf8');
    return JSON.parse(utf8);
  });
  sinon.assert.match(actual, expected);
});

test.serial('can access the response from getRecords', async t => {
  const { kinesis: { kinesisClient }, firstStream } = t.context;
  const firstIterator = await KinesisIterator.newIterator({ kinesisClient, streamName: firstStream });
  await firstIterator.next();
  t.not(firstIterator.response, undefined);
});

test.serial('can iterate through stream to handler', async t => {
  const { kinesis: { kinesisClient }, firstStream, secondStream, localStack: { services: { lambda: { client } } } } = t.context;
  const expected = [...Array(20)].map(() => ({ key: uuid() }));

  await kinesisClient.putRecords(formatRecords(firstStream, expected)).promise();
  const firstIterator = await KinesisIterator.newIterator({ kinesisClient, streamName: firstStream });
  const secondIterator = new KinesisIterator({ kinesisClient, streamName: secondStream });

  await kinesisLambdaTrigger({
    kinesisIterator: firstIterator,
    lambdaHandler: async (event) => client.invoke({
      FunctionName: handlerName,
      InvocationType: 'RequestResponse',
      Payload: Buffer.from(JSON.stringify(event))
    }).promise()
  });
  await secondIterator.next();
  const actual = await secondIterator.records.map(({ Data }) => {
    const base64 = Buffer.from(Data, 'base64');
    const utf8 = base64.toString('utf8');
    return JSON.parse(utf8);
  });
  sinon.assert.match(actual, expected);
});
