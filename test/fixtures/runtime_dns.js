const assert = require('assert');
const dns = require('dns');
const sinon = require('sinon');

exports.handler = (event, context, callback) => {
  const failure = new Error('simulated failure');
  failure.code = dns.NOTFOUND;

  const lookup = sinon.stub(dns.lookup, '_raw')
    .callsArgWith(2, failure)
    .withArgs('example.com', sinon.match.object, sinon.match.func)
    .onFirstCall().callsArgWith(2, failure)
    .onSecondCall().callsArgWith(2, failure)
    .onThirdCall().callsArgWith(2, null, '127.0.0.1', 4);

  dns.lookup('example.com', (error, hostname, family) => {
    try {
      assert.ifError(error);
      assert.equal(hostname, '127.0.0.1');
      assert.equal(family, 4);
      sinon.assert.callCount(lookup, 3);
    } catch (error) {
      callback(error);
      return;
    }
    callback(null, 'success!');
  });
};
