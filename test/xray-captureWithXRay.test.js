const test = require('ava');
const sinon = require('sinon');
const xray = require('../src/xray');

test('X-Ray integration is added', function (t) {
  const xrayCore = require('aws-xray-sdk-core');
  const AWS = require('aws-sdk');
  sinon.spy(xrayCore, 'captureHTTPsGlobal');
  sinon.spy(xrayCore, 'captureAWS');
  sinon.spy(xrayCore, 'capturePromise');

  const returnedAWS = xray.captureWithXRay(AWS);

  t.is(returnedAWS, AWS);

  t.truthy(xrayCore.captureHTTPsGlobal.calledOnce);
  t.truthy(xrayCore.captureAWS.calledOnce);
  t.truthy(xrayCore.capturePromise.calledOnce);
});
