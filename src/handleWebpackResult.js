const supportsColor = require('supports-color');

module.exports = (webpackResult) => {
  console.log('Webpacking compilation result:\n', webpackResult.toString({
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
