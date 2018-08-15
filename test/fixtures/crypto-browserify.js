// The function will not work correctly if this is not swapped out when the
// function is built.
// eslint-disable-next-line import/no-extraneous-dependencies
const crypto = require('crypto-browserify');

exports.handler = (event, context, callback) => {
  callback(null, crypto.constants.defaultCoreCipherList);
};
