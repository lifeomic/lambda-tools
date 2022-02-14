const test = require('ava');
const { WriteBuffer } = require('../src/WriteBuffer');

const { Writable } = require('stream');

test('A buffer is a writable stream', (test) => {
  const buffer = new WriteBuffer();
  test.true(buffer instanceof Writable);
});

test('A buffer can encode the collected data as a string', () => {
  const buffer = new WriteBuffer();
  buffer.write('aGVsbG8=', 'base64');
  buffer.write('20', 'hex');
  buffer.write('world');

  test.is(buffer.toString('utf8'), 'hello world');
});

test('the buffer can be reset', (test) => {
  const buffer = new WriteBuffer();
  buffer.write('aGVsbG8=', 'base64');
  buffer.write('20', 'hex');
  buffer.reset();
  buffer.write('world');

  test.is(buffer.toString('utf8'), 'world');
});
