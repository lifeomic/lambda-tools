import assert from 'assert';
import fs from 'fs-extra';
import path from 'path';
import { BannerPlugin } from 'webpack';

const patches = {
  dns: {
    file: path.resolve(__dirname, 'dns.js')
  },

  lambda: {
    file: path.resolve(__dirname, 'lambda.js')
  }
} as const;

export const loadPatch = async (name: keyof typeof patches) => {
  const patch = patches[name];
  assert(patch, `No patch found for '${name}'`);

  return new BannerPlugin({
    test: /\.js$/,
    raw: true,
    // eslint-disable-next-line security/detect-non-literal-fs-filename
    banner: await fs.readFile(patch.file, { encoding: 'utf8' })
  });
};
