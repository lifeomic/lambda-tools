const supportsColor = require('supports-color');
const { getLogger } = require('./utils/logging');
const logger = getLogger('webpack');

module.exports = (webpackResult) => {
  logger.info('Webpacking compilation result:\n', webpackResult.toString({
    colors: !!supportsColor.stdout,
    // hide excessive chunking output
    chunks: false,
    // hide other built modules
    maxModules: 0,
    // hide warning traces
    moduleTrace: false
  }));

  if (webpackResult.hasErrors()) {
    throw new Error('compilation_error');
  }
};
