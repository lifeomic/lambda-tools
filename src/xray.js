const xray = require('aws-xray-sdk-core');

exports.captureAWS = function(awsSdk) {
    return xray.captureAWS(awsSdk);
};

exports.captureWithXRay = (awsSdk) => {
  xray.captureHTTPsGlobal(require('http'));
  captureAWS(awsSdk);
  xray.capturePromise();
};
