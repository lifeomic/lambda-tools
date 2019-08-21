const AWS = require('aws-sdk');
const NestedError = require('nested-error-stacks');
const promiseRetry = require('promise-retry');

function buildConfigFromConnection (connection) {
  return Object.assign({
    credentials: new AWS.Credentials(connection.accessKey, connection.secretAccessKey),
    endpoint: new AWS.Endpoint(connection.url),
    region: connection.region,
    maxRetries: 10
  });
}

function buildConnectionAndConfig ({
  url,
  cleanup = () => {}
}) {
  const connection = {
    url,
    cleanup,
    region: process.env.AWS_REGION || 'us-east-1',
    accessKey: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
  };
  const config = buildConfigFromConnection(connection);
  return {connection, config};
}

async function waitForReady (awsType, retryFunc) {
  await promiseRetry(async function (retry, retryNumber) {
    try {
      await retryFunc();
    } catch (error) {
      retry(new NestedError(`${awsType} is still not ready after ${retryNumber} connection attempts`, error));
    }
  }, {minTimeout: 500, retries: 2});
}

module.exports = {
  buildConfigFromConnection,
  buildConnectionAndConfig,
  waitForReady
};
