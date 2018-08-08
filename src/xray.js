const xray = require('aws-xray-sdk-core');

exports.captureWithXRay = function (awsSdk) {
  xray.captureHTTPsGlobal(require('http'));
  xray.capturePromise();
  return xray.captureAWS(awsSdk);
};
