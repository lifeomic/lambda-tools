// The function will not work correctly if this is not swapped out when the
// function is built.
const cryptoBrowserify = require('crypto-browserify');
const nodeCrypto = require('crypto');
const assert = require('assert');

exports.handler = () => {
  assert.deepStrictEqual(cryptoBrowserify, nodeCrypto, 'crypto != crypto-browserify');
  return 'crypto === crypto-browserify';
};
