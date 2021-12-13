import {Writable, WritableOptions} from 'stream';

type WriteParams = Parameters<Writable['_write']>;

export class WriteBuffer extends Writable {
  private _buffer: Buffer[] = []
  constructor (options?: WritableOptions) {
    super(options);
  }

  reset (): void {
    this._buffer = [];
  }

  toString (encoding?: BufferEncoding): string {
    return this._buffer.map((chunk) => chunk.toString(encoding)).join('');
  }

  _write (chunk: WriteParams[0], encoding: WriteParams[1], callback: WriteParams[2]): void {
    this._buffer.push(Buffer.from(chunk, encoding as BufferEncoding));
    callback();
  }
}

export default WriteBuffer;
