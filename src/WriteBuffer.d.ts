import {Writable} from 'stream';
export default class WriteBuffer extends Writable {
  toString(encoding: string): string;
}
