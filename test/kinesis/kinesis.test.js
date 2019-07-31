const test = require('ava');
const AWS = require('aws-sdk');
const sinon = require('sinon');

const { streams, getConnection, createStreams, destroyStreams } = require('../../src/kinesis');

function throwTestError () {
  throw new Error('test');
}

test.before(async t => {
  Object.assign(t.context, await getConnection());
});

test.beforeEach((t) => {
  const {config} = t.context;
  streams(['test-stream']);
  const kinesisClient = new AWS.Kinesis(config);
  Object.assign(t.context, {kinesisClient});
});

test.afterEach(() => {
  streams([]);
});

test.after(async t => {
  const {connection} = t.context;
  await connection.cleanup();
});

async function assertStreamsPresent (t, client, expected, message) {
  const response = await client.listStreams().promise();
  t.false(response.HasMoreStreams);
  t.deepEqual(
    response.StreamNames,
    expected,
    message
  );
}

test.serial('createStreams creates streams according to specified schemas', async (t) => {
  const { kinesisClient } = t.context;

  await createStreams(kinesisClient);
  await assertStreamsPresent(
    t,
    kinesisClient,
    ['test-stream'],
    'createStream should have added "test-stream"'
  );
});

test.serial('throws when createStreams fails', async t => {
  const { kinesisClient } = t.context;

  sinon.stub(kinesisClient, 'createStream').onFirstCall().callsFake(throwTestError);
  const { message } = await t.throwsAsync(createStreams(kinesisClient));
  t.is(message, 'Failed to create streams: test-stream');
});

test.serial('throws when createStream fails, logs if destory fails', async t => {
  const { kinesisClient } = t.context;

  const StreamName = 'test-stream-2';

  streams([
    StreamName,
    'test-stream'
  ]);

  sinon.stub(kinesisClient, 'createStream')
    .callThrough()
    .onSecondCall().callsFake(throwTestError);
  const deleteTable = sinon.stub(kinesisClient, 'deleteStream')
    .callThrough()
    .onFirstCall().callsFake(throwTestError);

  const { message } = await t.throwsAsync(createStreams(kinesisClient));

  t.is(message, 'Failed to create streams: test-stream');
  sinon.assert.calledOnce(deleteTable);
  sinon.assert.calledWithExactly(deleteTable, {StreamName});

  await kinesisClient.deleteStream({StreamName}).promise();
});

test.serial('throws when destroyStreams fails', async t => {
  const { kinesisClient } = t.context;

  sinon.stub(kinesisClient, 'listStreams').onFirstCall().returns({
    promise: () => Promise.resolve({
      StreamNames: ['test-stream']
    })
  });
  sinon.stub(kinesisClient, 'deleteStream').onFirstCall().callsFake(throwTestError);
  const { message } = await t.throwsAsync(destroyStreams(kinesisClient));
  t.is(message, 'Failed to destroy streams: test-stream');
});

test.serial('destroyStreams destroys created stream', async t => {
  const { kinesisClient } = t.context;

  await createStreams(kinesisClient);

  await assertStreamsPresent(
    t,
    kinesisClient,
    ['test-stream'],
    'createStreams should have added "test-stream"'
  );

  await destroyStreams(kinesisClient);
  await assertStreamsPresent(
    t,
    kinesisClient,
    [],
    'createStreams should have destroyed "test-stream"'
  );
});
