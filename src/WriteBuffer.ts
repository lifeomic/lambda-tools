import { Writable, WritableOptions } from 'stream';

export class WriteBuffer extends Writable {
  private _buffer: Buffer[] = [];
  constructor (options?: WritableOptions) {
    super(options);
  }

  reset () {
    this._buffer = [];
  }

  toString (encoding?: BufferEncoding) {
    return this._buffer.map((chunk) => chunk.toString(encoding)).join('');
  }

  _write (chunk: string, encoding: string = 'utf-8', callback: (error?: Error | null) => void) {
    this._buffer.push(Buffer.from(chunk, encoding as BufferEncoding));
    callback();
  }
}

export default WriteBuffer;
