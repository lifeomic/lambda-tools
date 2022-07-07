import { compile } from '@lifeomic/compile-tool-webpack'
export { Config } from '@lifeomic/compile-tool-webpack'

export interface Entrypoint {
  file: string;
  name: string;
}

export default compile
