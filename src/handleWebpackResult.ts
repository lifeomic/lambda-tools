import supportsColor from 'supports-color';
import { getLogger } from './utils/logging';
import webpack from "webpack";
const logger = getLogger('webpack');

export const handleWebpackResults = (webpackResult?: webpack.Stats) => {
  if (!webpackResult) {
    logger.error('No webpack result');
    throw new Error('compilation_error');
  }

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
