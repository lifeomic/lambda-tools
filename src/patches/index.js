const assert = require('assert');
const fs = require('fs-extra');
const get = require('lodash/get');
const path = require('path');
const WrapperPlugin = require('wrapper-webpack-plugin');

const patches = {
  dns: {
    file: path.resolve(__dirname, 'dns.js'),
    // DNS patches need to be inserted at the beginning of the bundle so that
    // the DNS module can be updated before any other module loads it.
    placement: 'header'
  },

  lambda: {
    file: path.resolve(__dirname, 'lambda.js'),
    placement: 'footer'
  }
};

exports.loadPatch = async (name) => {
  const patch = get(patches, name);
  assert(patch, `No patch found for '${name}'`);

  return new WrapperPlugin({
    test: /\.js$/,
    // eslint-disable-next-line security/detect-non-literal-fs-filename
    [patch.placement]: await fs.readFile(patch.file, { encoding: 'utf8' })
  });
};
