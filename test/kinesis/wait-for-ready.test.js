const test = require('ava');
const sinon = require('sinon');

const AWS = require('aws-sdk');
const AWSMock = require('aws-sdk-mock');
AWSMock.setSDKInstance(AWS);

// Setup a mock listStreams call that will fail once
// to force a retry and then success to allow the setup
// to continue
const listStreamsMock = sinon.stub()
  .onFirstCall().rejects(new Error('First error'))
  .resolves({ StreamNames: [] }, []);

AWSMock.mock('Kinesis', 'listStreams', listStreamsMock);

const { useKinesisDocker } = require('../../src/kinesis');

useKinesisDocker(test);

test.serial('The helper provides database clients and streams', () => {
  // Listing the Streams should be called twice. Once for the failure and the
  // second for success to allow the `before` block to complete
  sinon.assert.calledTwice(listStreamsMock);
});
