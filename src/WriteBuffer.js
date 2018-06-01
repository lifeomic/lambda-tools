const { Writable } = require('stream');

class WriteBuffer extends Writable {
  constructor (options) {
    super(options);
    this.reset();
  }

  reset () {
    this._buffer = [];
  }

  toString (encoding) {
    return this._buffer.map((chunk) => chunk.toString(encoding)).join('');
  }

  _write (chunk, encoding, callback) {
    this._buffer.push(Buffer.from(chunk, encoding));
    callback();
  }
}

module.exports = WriteBuffer;
