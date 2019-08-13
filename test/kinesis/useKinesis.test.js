const test = require('ava');
const {useKinesis} = require('../../src/kinesis');
const sinon = require('sinon');

const AWS = require('aws-sdk');
const AWSMock = require('aws-sdk-mock');
AWSMock.setSDKInstance(AWS);

AWS.config.region = 'us-east-1';

const createStreamStub = sinon.stub().yields();
const deleteStreamStub = sinon.stub().yields();
AWSMock.mock('Kinesis', 'createStream', createStreamStub);
AWSMock.mock('Kinesis', 'deleteStream', deleteStreamStub);

const TEST_STREAM_NAME = 'stream-name';

useKinesis(test, TEST_STREAM_NAME);

test.after(function () {
  sinon.assert.calledOnce(deleteStreamStub);
  sinon.assert.calledWith(deleteStreamStub, {
    StreamName: TEST_STREAM_NAME
  });
});

test('provides a kinesis client to the tests', (test) => {
  test.truthy(test.context.kinesis);
  test.is(typeof test.context.kinesis.putRecord, 'function');
});

test('calls createStream to create the stream', (test) => {
  sinon.assert.calledOnce(createStreamStub);
  sinon.assert.calledWith(createStreamStub, {
    StreamName: TEST_STREAM_NAME,
    ShardCount: 1
  });
});
