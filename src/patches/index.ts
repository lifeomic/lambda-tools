import assert from 'assert';
import path from 'path';
import { promises as fs } from 'fs';
import { BannerPlugin } from 'webpack';

const patches = {
  dns: async () => new BannerPlugin({
    test: /\.js$/,
    raw: true,
    banner: await fs.readFile(path.resolve(__dirname, 'dns.js'), { encoding: 'utf8' }),
  }),
  lambda: async () => new BannerPlugin({
    test: /\.js$/,
    raw: true,
    footer: true,
    banner: await fs.readFile(path.resolve(__dirname, 'lambda.js'), { encoding: 'utf8' }),
  }),
} as const;

export const loadPatch = async (name: keyof typeof patches) => {
  const patch = patches[name];
  assert(patch, `No patch found for '${name}'`);

  return await patch();
};
