import assert from 'assert';
import fs from 'fs-extra';
import get from 'lodash/get';
import path from 'path';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const WrapperPlugin = require('wrapper-webpack-plugin');

const patches = {
  dns: {
    file: path.resolve(__dirname, 'dns.js'),
    // DNS patches need to be inserted at the beginning of the bundle so that
    // the DNS module can be updated before any other module loads it.
    placement: 'header',
  },

  lambda: {
    file: path.resolve(__dirname, 'lambda.js'),
    placement: 'footer',
  },
} as const;


export const loadPatch = async (name: keyof typeof patches) => {
  const patch = get(patches, name);
  assert(patch, `No patch found for '${name}'`);

  return new WrapperPlugin({
    test: /\.js$/,
    [patch.placement]: await fs.readFile(patch.file, { encoding: 'utf8' }),
  });
};
