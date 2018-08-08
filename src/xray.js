const xray = require('aws-xray-sdk-core');

exports.captureWithXRay = () => {
  if (process.env.LAMBDA_TASK_ROOT) {
    xray.captureHTTPsGlobal(require('http'));
    xray.captureAWS(require('aws-sdk'));
    xray.capturePromise();
  }
};
