const AWS = require('aws-sdk');
const NestedError = require('nested-error-stacks');
const promiseRetry = require('promise-retry');

function buildConfigFromConnection (connection, {
  httpOptions = {timeout: 10000},
  maxRetries = 10
} = {}) {
  return Object.assign({
    credentials: new AWS.Credentials(connection.accessKey, connection.secretAccessKey),
    endpoint: new AWS.Endpoint(connection.url),
    region: connection.region,
    httpOptions,
    maxRetries
  });
}

function buildConnectionAndConfig ({
  url,
  externalConfig,
  cleanup = () => {},
  accessKey = process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY
}) {
  const connection = {
    accessKey,
    cleanup,
    region: 'us-east-1',
    secretAccessKey,
    url
  };
  const config = buildConfigFromConnection(connection, externalConfig);
  return {connection, config};
}

async function waitForReady (awsType, retryFunc) {
  await promiseRetry(async function (retry, retryNumber) {
    try {
      await retryFunc();
    } catch (error) {
      retry(new NestedError(`${awsType} is still not ready after ${retryNumber} connection attempts`, error));
    }
  }, {factor: 1, minTimeout: 500, retries: 20});
}

module.exports = {
  buildConfigFromConnection,
  buildConnectionAndConfig,
  waitForReady
};
