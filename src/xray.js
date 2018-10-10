
// We are passing in the client AWS-SDK in order to avoid version conflict.
// If the calling project and lambda-tools do not agree on the AWS-SDK version then the
// caller's SDK instance will not get instrumented and there will not be any warning.
exports.captureWithXRay = function (awsSdk) {
  const xray = require('aws-xray-sdk-core');

  xray.captureHTTPsGlobal(require('http'));
  xray.capturePromise();
  return xray.captureAWS(awsSdk);
};
