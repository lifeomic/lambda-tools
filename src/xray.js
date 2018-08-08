const xray = require('aws-xray-sdk-core');

exports.captureAWS = function (awsSdk) {
  return xray.captureAWS(awsSdk);
};

exports.captureWithXRay = (awsSdk) => {
  xray.captureHTTPsGlobal(require('http'));
  const AWS = xray.captureAWS(awsSdk);
  xray.capturePromise();
  return AWS;
};
