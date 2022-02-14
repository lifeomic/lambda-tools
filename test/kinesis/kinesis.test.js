const test = require('ava');
const AWS = require('aws-sdk');
const sinon = require('sinon');
const { v4: uuid } = require('uuid');

const { streams, getConnection, createStreams, destroyStreams } = require('../../src/kinesis');

function throwTestError () {
  throw new Error('test');
}

test.before(async (t) => {
  Object.assign(t.context, await getConnection());
});

test.beforeEach((t) => {
  const { config } = t.context;
  streams(['test-stream']);
  const kinesisClient = new AWS.Kinesis(config);
  Object.assign(t.context, { kinesisClient });
});

test.afterEach(() => {
  streams([]);
});

test.after(async (t) => {
  const { connection } = t.context;
  await connection.cleanup();
});

async function assertStreamsPresent (t, client, expected, message) {
  const response = await client.listStreams().promise();
  t.false(response.HasMoreStreams);
  t.deepEqual(
    response.StreamNames,
    expected,
    message,
  );
}

test.serial('createStreams creates streams according to specified schemas', async (t) => {
  const { kinesisClient } = t.context;

  await createStreams(kinesisClient);
  await assertStreamsPresent(
    t,
    kinesisClient,
    ['test-stream'],
    'createStream should have added "test-stream"',
  );
});

test.serial('throws when createStreams fails', async (t) => {
  const { kinesisClient } = t.context;

  sinon.stub(kinesisClient, 'createStream').onFirstCall().callsFake(throwTestError);
  const { message } = await t.throwsAsync(createStreams(kinesisClient));
  t.is(message, 'Failed to create streams: test-stream');
});

test.serial('deletes created streams when createStreams fails', async (t) => {
  const { kinesisClient } = t.context;

  streams([
    'test-stream-not-created',
    'test-stream-created',
  ]);

  sinon.stub(kinesisClient, 'createStream')
    .callThrough()
    .onFirstCall().callsFake(throwTestError);
  const deleteStream = sinon.spy(kinesisClient, 'deleteStream');

  const { message } = await t.throwsAsync(createStreams(kinesisClient));
  t.is(message, 'Failed to create streams: test-stream-not-created');
  const { StreamNames } = await kinesisClient.listStreams().promise();
  t.deepEqual(StreamNames, []);
  sinon.assert.calledOnce(deleteStream);
  sinon.assert.calledWithExactly(deleteStream, { StreamName: 'test-stream-created' });
});

test.serial('throws when createStream fails, logs if destory fails', async (t) => {
  const { kinesisClient } = t.context;

  const StreamName = 'test-stream-2';

  streams([
    StreamName,
    'test-stream',
  ]);

  sinon.stub(kinesisClient, 'createStream')
    .callThrough()
    .onSecondCall().callsFake(throwTestError);
  const deleteStream = sinon.stub(kinesisClient, 'deleteStream')
    .callThrough()
    .onFirstCall().callsFake(throwTestError);

  const { message } = await t.throwsAsync(createStreams(kinesisClient));

  t.is(message, 'Failed to create streams: test-stream');
  sinon.assert.calledOnce(deleteStream);
  sinon.assert.calledWithExactly(deleteStream, { StreamName });

  await kinesisClient.deleteStream({ StreamName }).promise();
});

test.serial('throws when destroyStreams fails', async (t) => {
  const { kinesisClient } = t.context;

  sinon.stub(kinesisClient, 'listStreams').onFirstCall().returns({
    promise: () => Promise.resolve({
      StreamNames: ['test-stream'],
    }),
  });
  sinon.stub(kinesisClient, 'deleteStream').onFirstCall().callsFake(throwTestError);
  const { message } = await t.throwsAsync(destroyStreams(kinesisClient));
  t.is(message, 'Failed to destroy streams: test-stream');
});

async function destroyStreamTest (t, useUniqueStreams) {
  const { kinesisClient } = t.context;
  const uniqueIdentifier = useUniqueStreams ? uuid() : '';
  const streamName = useUniqueStreams
    ? `test-stream-${uniqueIdentifier}` : 'test-stream';

  await createStreams(kinesisClient, uniqueIdentifier);

  await assertStreamsPresent(
    t,
    kinesisClient,
    [streamName],
    `createStreams should have added "${streamName}"`,
  );

  await destroyStreams(kinesisClient, uniqueIdentifier);
  await assertStreamsPresent(
    t,
    kinesisClient,
    [],
    `createStreams should have destroyed "${streamName}"`,
  );
}

test.serial('destroyStreams destroys created stream', async (t) => {
  await destroyStreamTest(t, false);
});

test.serial('destroyStreams destroys created stream when uniqueIdentifier is used', async (t) => {
  await destroyStreamTest(t, true);
});
