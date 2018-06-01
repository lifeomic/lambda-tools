const assert = require('assert');

exports.handler = (event, context, callback) => {
  const listeners = process.listeners('beforeExit');
  assert(listeners.length === 2, `unexpected number of listeners ${listeners.length}`);

  // Need to remove the AWS listener so that we don't terminate early
  process.removeListener('beforeExit', listeners[1]);
  process.emit('beforeExit');
  // Re-add the listener to ensure that lambci/lambda output doesn't get messed up
  process.addListener('beforeExit', listeners[1]);

  const listenerCount = process.listenerCount('beforeExit');
  assert(listenerCount === 1, `listener cleanup failed ${listenerCount}`);
};
