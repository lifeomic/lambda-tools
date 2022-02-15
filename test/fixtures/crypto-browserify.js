// The function will not work correctly if this is not swapped out when the
// function is built.
const cryptoBrowserify = require('crypto-browserify');
const nodeCrypto = require('crypto');
const assert = require('assert');

// eslint-disable-next-line require-await, no-unused-vars
exports.handler = async (event, context, callback) => {
  assert.deepStrictEqual(cryptoBrowserify, nodeCrypto, 'crypto != crypto-browserify');
  return 'crypto === crypto-browserify';
};
