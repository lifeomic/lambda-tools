const babelEnvDeps = require('webpack-babel-env-deps');
const fs = require('fs-extra');
const path = require('path');
const TerserPlugin = require('terser-webpack-plugin');
const webpack = require('webpack');
const { zip } = require('./zip');
const chalk = require('chalk');
const { promisify } = require('util');
const glob = promisify(require('glob'));
const { handleWebpackResults } = require('./handleWebpackResult');
const defaults = require('lodash/defaults');

const { loadPatch } = require('./patches');
const { getLogger } = require('./utils/logging');
const logger = getLogger('webpack');

const WEBPACK_DEFAULTS = new webpack.WebpackOptionsDefaulter().process({});
const run = promisify(webpack);

const CALLER_NODE_MODULES = 'node_modules';
const DEFAULT_NODE_VERSION = '12.13.0';
const LAMBDA_TOOLS_NODE_MODULES = path.resolve(__dirname, '..', 'node_modules');

const getNormalizedFileName = (file) => path.basename(file).replace(/.ts$/, '.js');

const parseEntrypoint = (entrypoint) => {
  const [ file, name ] = entrypoint.split(':');

  return {
    file: path.resolve(file),
    name: name || getNormalizedFileName(file)
  };
};

/**
 * Helper function to trim absolute file path by removing the `process.cwd()`
 * prefix if file is nested under `process.cwd()`.
 */
function makeFilePathRelativeToCwd (file) {
  const cwd = process.cwd();
  return (file.startsWith(cwd)) ? '.' + file.substring(cwd.length) : file;
}

/**
 * @param {String} outputDir the directory that contains output files
 * @param {String[]} entryNames the entrypoint names from which output was produced
 */
async function zipOutputFiles (outputDir, entryNames) {
  logger.info('\nCreating zip file for each entrypoint...\n');

  for (const entryName of entryNames) {
    const dirname = path.dirname(entryName);
    const outputZipBasename = `${entryName}.zip`;
    const outputZipFile = path.join(outputDir, outputZipBasename);

    // Find all of the output files that belong to this entry
    const entriesForZipFile = (await glob(`${entryName}*`, {
      cwd: outputDir,
      // ignore previously output zip file for repeatability
      ignore: outputZipBasename
    })).map((file) => {
      return {
        name: (dirname === '.') ? file : file.substring(dirname.length + 1),
        file: path.join(outputDir, file)
      };
    });

    // Now, write a zip file for each entry
    logger.info(`Creating zip for entrypoint ${chalk.bold(entryName)}...`);
    logger.info(entriesForZipFile.map((entry) => {
      return `- ${chalk.bold(entry.name)}\n`;
    }).join(''));
    await zip(outputZipFile, entriesForZipFile);
    logger.info(chalk.green(`Zip file for ${chalk.bold(entryName)} written to ` +
      `${chalk.bold(makeFilePathRelativeToCwd(outputZipFile))}\n`));
  }
}

const INDEX_FILES = ['index.js', 'index.ts'];

async function findIndexFile (dir) {
  for (const indexFile of INDEX_FILES) {
    const candidateFile = path.join(dir, indexFile);
    try {
      // eslint-disable-next-line security/detect-non-literal-fs-filename
      const stats = await fs.stat(candidateFile);
      if (!stats.isDirectory()) {
        return candidateFile;
      }
    } catch (err) {
      if (err.code !== 'ENOENT') {
        logger.warn(chalk.yellow(`Unable to read possible index file ` +
          `${chalk.bold(candidateFile)}. ` +
          `Skipping! ${chalk.red(err.toString())}`));
      }
    }
  }

  logger.warn(chalk.yellow(`No index file for entrypoint in ` +
    `${chalk.bold(makeFilePathRelativeToCwd(dir))} directory. ` +
    `Searched for: ${INDEX_FILES.join(', ')}`));

  // We didn't find an index file so return null and the caller will
  // ignore this directory
  return null;
}

async function expandEntrypoints (entrypoints) {
  const finalEntrypoints = [];

  for (const entrypoint of entrypoints) {
    // eslint-disable-next-line security/detect-non-literal-fs-filename
    const stats = await fs.stat(entrypoint.file);

    // Is the entrypoint a directory?
    if (stats.isDirectory()) {
      // The entrypoint is a directory so let's get the contents
      // of this directory
      // eslint-disable-next-line security/detect-non-literal-fs-filename
      const directoryFiles = await fs.readdir(entrypoint.file);

      // Iterate through the files within this directory
      for (const directoryFile of directoryFiles) {
        const directoryFileAbs = path.join(entrypoint.file, directoryFile);
        // eslint-disable-next-line security/detect-non-literal-fs-filename
        const directoryFileStats = await fs.stat(directoryFileAbs);

        if (directoryFileStats.isDirectory()) {
          // We found a directory nested within the entrypoint directory.
          // Look for an index file within this subdirectory which we will
          // use as an entrypoint.
          const indexFile = await findIndexFile(directoryFileAbs);

          if (indexFile) {
            // We found an index file in thie directory so use this
            // as an entrypoint.
            finalEntrypoints.push({
              file: indexFile,
              name: `${directoryFile}.js`
            });
          }
        } else {
          // We found a file under the subdirectory. Is it a
          // JavaScript or TypeScript file?
          if (/\.(js|ts)$/.test(directoryFile)) {
            finalEntrypoints.push(parseEntrypoint(directoryFileAbs));
          }
        }
      }
    } else {
      finalEntrypoints.push(entrypoint);
    }
  }

  return finalEntrypoints;
}

module.exports = async ({ entrypoint, serviceName = 'test-service', ...options }) => {
  options = defaults(options, { enableRuntimeSourceMaps: false });

  // If an entrypoint is a directory then we discover all of the entrypoints
  // within that directory.
  // For example, entrypoint might be "./src/lambdas" and we might discover
  // "./src/lambdas/abc/index.js" (a subdirectory with index file)
  // and "./src/lambdas/def.js" (a simple file)
  const entrypoints = await expandEntrypoints(
    [].concat(entrypoint).map((entrypoint) => {
      return parseEntrypoint(entrypoint);
    }));

  const entry = entrypoints.reduce(
    (accumulator, entry) => {
      const { file, name } = entry;
      const preloadModules = ['@babel/polyfill'];
      if (options.enableRuntimeSourceMaps) {
        preloadModules.push('source-map-support/register');
      }
      // eslint-disable-next-line security/detect-object-injection
      accumulator[name] = [...preloadModules, file];
      return accumulator;
    },
    {}
  );

  const nodeVersion = options.nodeVersion || DEFAULT_NODE_VERSION;

  const plugins = [
    new webpack.NormalModuleReplacementPlugin(/^any-promise$/, 'core-js/fn/promise'),
    new webpack.DefinePlugin({
      'global.GENTLY': false,
      'process.env.LIFEOMIC_SERVICE_NAME': `'${serviceName}'`
    }),
    await loadPatch('lambda')
  ];

  if (options.enableDnsRetry) {
    plugins.push(await loadPatch('dns'));
  }

  const babelEnvConfig = [
    '@babel/preset-env',
    {
      targets: {
        node: nodeVersion
      }
    }
  ];

  const babelLoaderConfig = {
    exclude: [ babelEnvDeps.exclude({ engines: { node: '>=' + nodeVersion } }) ],
    loader: 'babel-loader'
  };

  const outputDir = path.resolve(options.outputPath || process.cwd());

  const removeAsyncAwaitLoader = {
    loader: 'babel-loader',
    options: {
      cacheDirectory: options.cacheDirectory,
      presets: [ babelEnvConfig ],
      plugins: [
        // This plugin will transform async iterators into generator functions
        '@babel/plugin-proposal-async-generator-functions',
        // X-Ray tracing cannot currently track execution across
        // async/await calls. The issue is tracked upstream at
        // https://github.com/aws/aws-xray-sdk-node/issues/12
        // https://github.com/aws/aws-xray-sdk-node/issues/60
        // Using transform-async-to-generator will convert async/await into
        // generators which can be traced with X-Ray
        '@babel/plugin-transform-async-to-generator'
      ]
    }
  };

  const tsRule = options.tsconfig
    ? {
      use: [
        // Remove any async/await calls that might be left over from
        // TypeScript transpiling so that X-Ray integration is good.
        removeAsyncAwaitLoader,
        {
          loader: 'ts-loader',
          options: {
            configFile: options.tsconfig
          }
        }
      ]
    } : {
      ...babelLoaderConfig,
      options: {
        cacheDirectory: options.cacheDirectory,
        presets: [
          babelEnvConfig,
          require('@babel/preset-typescript')
        ]
      }
    };

  const optimization = options.minify
    ? { minimizer: [new TerserPlugin({ sourceMap: true })] }
    : { minimize: false };

  const devtool = options.enableRuntimeSourceMaps
    ? 'source-map'
    : 'hidden-source-map';

  const config = {
    entry,
    output: {
      path: outputDir,
      libraryTarget: 'commonjs',
      // Zipped bundles use explicit output names to determine the archive name
      filename: '[name]'
    },
    devtool,
    plugins,
    module: {
      rules: [
        // See https://github.com/bitinn/node-fetch/issues/493
        {
          type: 'javascript/auto',
          test: /\.mjs$/,
          use: []
        },
        {
          test: /\.js$/,
          ...removeAsyncAwaitLoader
        },
        {
          test: /\.ts$/,
          ...tsRule
        }
      ]
    },
    mode: process.env.WEBPACK_MODE || 'production',
    optimization,
    resolve: {
      // Since build is being called by other packages dependencies may be
      // relative to the caller or us. This cause our node modules to be
      // searched if a dependency can't be found in the caller's.
      modules: [ CALLER_NODE_MODULES, LAMBDA_TOOLS_NODE_MODULES ],
      extensions: WEBPACK_DEFAULTS.resolve.extensions.concat(['.ts'])
    },
    resolveLoader: {
      // Since build is being called by other packages dependencies may be
      // relative to the caller or us. This puts our node_modules on the
      // resolver path before trying to use the caller's.
      modules: [ LAMBDA_TOOLS_NODE_MODULES, CALLER_NODE_MODULES ]
    },
    target: 'node',
    // Don't overrite __dirname and __filename, leave them as is
    // https://github.com/webpack/webpack/issues/1599
    node: {
      __dirname: false,
      __filename: false
    },
    externals: {
      'aws-sdk': 'aws-sdk',
      // crypto-browserify is a port of Node's crypto package for browsers.
      // However, it tends to be less reliable than the native crypto. This
      // causes native crypto to be used instead.
      'crypto-browserify': 'crypto',
      'dtrace-provider': 'dtrace-provider',
      'vertx': 'vertx'
    }
  };

  const transformer = options.configTransformer || function (config) { return config; };
  const transformedConfig = await transformer(config);

  const webpackResult = await run(transformedConfig);

  handleWebpackResults(webpackResult);

  if (options.zip) {
    await zipOutputFiles(outputDir, Object.keys(entry));
  }

  return webpackResult;
};
