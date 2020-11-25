const { Environment } = require('../../src/Environment');
const test = require('ava');
const sinon = require('sinon');
const AWS = require('aws-sdk');
const AWSMock = require('aws-sdk-mock');
AWSMock.setSDKInstance(AWS);

// Mock listTables for `beforeAll` and `afterEach` hooks
const listTablesMock = sinon.stub()
  .resolves({ TableNames: [] }, []);

AWSMock.mock('DynamoDB', 'listTables', listTablesMock);

const { useDynamoDB } = require('../../src/dynamodb');
const environment = new Environment();

test.before(() => {
  environment.set('AWS_ACCESS_KEY_ID', 'test-access-key');
  environment.set('AWS_SECRET_ACCESS_KEY', 'test-secret-key');
  environment.set('DYNAMODB_ENDPOINT', 'dynamodb://localhost');
});

test.after(() => environment.restore());

useDynamoDB(test);

test.serial('When DYNAMODB_ENDPOINT is set configuration environment variables are not set', (test) => {
  test.is(process.env.AWS_ACCESS_KEY_ID, 'test-access-key');
  test.is(process.env.AWS_SECRET_ACCESS_KEY, 'test-secret-key');
  test.is(process.env.DYNAMODB_ENDPOINT, 'dynamodb://localhost');
});
