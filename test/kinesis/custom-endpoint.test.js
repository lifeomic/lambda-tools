const { Environment } = require('../../src/Environment');
const test = require('ava');
const sinon = require('sinon');
const AWS = require('aws-sdk');
const AWSMock = require('aws-sdk-mock');
AWSMock.setSDKInstance(AWS);
const docker = require('../../src/docker');
const ensureImageSpy = sinon.spy(docker, 'ensureImage');

// Mock listStreams for `beforeAll` and `afterEach` hooks
const listStreams = sinon.stub()
  .resolves({ StreamNames: [] }, []);

AWSMock.mock('Kinesis', 'listStreams', listStreams);

const { useKinesisDocker } = require('../../src/kinesis');
const environment = new Environment();

test.before(() => {
  environment.set('AWS_ACCESS_KEY_ID', 'test-access-key');
  environment.set('AWS_SECRET_ACCESS_KEY', 'test-secret-key');
  environment.set('KINESIS_ENDPOINT', 'kinesis://localhost');
});

test.after(() => environment.restore());

useKinesisDocker(test);

test.serial('When KINESIS_ENDPOINT is set configuration environment variables are not set', (test) => {
  test.is(process.env.AWS_ACCESS_KEY_ID, 'test-access-key');
  test.is(process.env.AWS_SECRET_ACCESS_KEY, 'test-secret-key');
  test.is(process.env.KINESIS_ENDPOINT, 'kinesis://localhost');
});

test.serial('When KINESIS_ENDPOINT is set configuration the Docker image is not started', () => {
  sinon.assert.notCalled(ensureImageSpy);
  docker.ensureImage.restore();
});
