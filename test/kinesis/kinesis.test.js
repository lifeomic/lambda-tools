const test = require('ava');
const AWS = require('aws-sdk');
const sinon = require('sinon');

const { streams, getConnection, createStreams, destroyStreams } = require('../../src/kinesis');

function throwTestError () {
  throw new Error('test');
}

test.before(() => {
  streams(['test-stream']);
});

test.after(() => {
  streams([]);
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
  const { connection, config } = await getConnection();

  try {
    const client = new AWS.Kinesis(config);
    await createStreams(client);
    await assertStreamsPresent(
      t,
      client,
      ['test-stream'],
      'createStream should have added "test-stream"'
    );
  } finally {
    await connection.cleanup();
  }
});

test.serial('throws when createStreams fails', async t => {
  const { connection, config } = await getConnection();

  try {
    const client = new AWS.Kinesis(config);
    sinon.stub(client, 'createStream').onFirstCall().callsFake(throwTestError);
    const { message } = await t.throwsAsync(createStreams(client));
    t.is(message, 'Failed to create streams: test-stream');
  } finally {
    await connection.cleanup();
  }
});

test.serial('throws when destroyStreams fails', async t => {
  const { connection, config } = await getConnection();

  try {
    const client = new AWS.Kinesis(config);
    sinon.stub(client, 'listStreams').onFirstCall().returns({
      promise: () => Promise.resolve({
        StreamNames: ['test-stream']
      })
    });
    sinon.stub(client, 'deleteStream').onFirstCall().callsFake(throwTestError);
    const { message } = await t.throwsAsync(destroyStreams(client));
    t.is(message, 'Failed to destroy streams: test-stream');
  } finally {
    await connection.cleanup();
  }
});

test.serial('destroyStreams destroys created stream', async t => {
  const { connection, config } = await getConnection();

  try {
    const client = new AWS.Kinesis(config);
    await createStreams(client);

    await assertStreamsPresent(
      t,
      client,
      ['test-stream'],
      'createStreams should have added "test-stream"'
    );

    await destroyStreams(client);
    await assertStreamsPresent(
      t,
      client,
      [],
      'createStreams should have destroyed "test-stream"'
    );
  } finally {
    await connection.cleanup();
  }
});
