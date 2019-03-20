const assert = require('assert');
const dns = require('dns');
const sinon = require('sinon');

exports.handler = (event, context, callback) => {
  const failure = new Error('simulated failure');
  failure.code = dns.NOTFOUND;

  // Simulate an extra pollyfill/shim
  dns.lookup = dns.lookup.bind(dns);

  const lookup = sinon.stub(dns._raw, 'lookup')
    .callsArgWith(2, failure)
    .withArgs('example.com', sinon.match.object, sinon.match.func)
    .onFirstCall().callsArgWith(2, failure)
    .onSecondCall().callsArgWith(2, failure)
    .onThirdCall().callsArgWith(2, null, '127.0.0.1', 4);

  const logSpy = sinon.stub(console, 'log');

  dns.lookup('example.com', (error, hostname, family) => {
    try {
      assert.ifError(error);
      assert.equal(hostname, '127.0.0.1');
      assert.equal(family, 4);
      sinon.assert.callCount(lookup, 3);

      sinon.assert.callCount(logSpy, 2);
      for (const attempt of [4, 3]) {
        sinon.assert.calledWith(logSpy, `DNS lookup of example.com failed and will be retried ${attempt} more times`);
      }
    } catch (error) {
      callback(error);
      return;
    }
    callback(null, 'success!');
  });
};
