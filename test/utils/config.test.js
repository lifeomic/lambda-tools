const test = require('ava');
const random = require('lodash/random');
const proxyquire = require('proxyquire').noPreserveCache();

test.serial('will default to max concurrency', t => {
  const { pQueue } = proxyquire('../../src/utils/config', {});
  t.is(pQueue._concurrency, Number.POSITIVE_INFINITY);
});

test.serial('can set the concurrency', t => {
  const concurrency = random(1, Number.MAX_SAFE_INTEGER);
  process.env.LAMBDA_TOOLS_CONCURRENCY = `${concurrency}`;
  const { pQueue } = proxyquire('../../src/utils/config', {});
  t.is(pQueue._concurrency, concurrency);
});
