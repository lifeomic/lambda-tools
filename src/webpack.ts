const babelEnvDeps = require('webpack-babel-env-deps');
import fs from 'fs-extra';
import path from 'path';
import TerserPlugin from 'terser-webpack-plugin';
import webpack from 'webpack';
const WebpackOptionsDefaulter = require('webpack/lib/WebpackOptionsDefaulter');
import { zip } from './zip';
import chalk from 'chalk';
import { promisify } from 'util';
import { default as rawGlob } from 'glob';
import { handleWebpackResults } from './handleWebpackResult';
import defaults from 'lodash/defaults';
import flatten from 'lodash/flatten';

import { loadPatch } from './patches';
import { getLogger } from './utils/logging';

const glob = promisify(rawGlob);
const logger = getLogger('webpack');

const WEBPACK_DEFAULTS = new WebpackOptionsDefaulter().process({});
const run = promisify<webpack.Configuration, webpack.Stats>(webpack);

const CALLER_NODE_MODULES = 'node_modules';
const DEFAULT_NODE_VERSION = '12.20.0';
const LAMBDA_TOOLS_NODE_MODULES = path.resolve(__dirname, '..', 'node_modules');

type Mode = 'development' | 'production' | 'none';

const getNormalizedFileName = (file: string) => path.basename(file).replace(/.ts$/, '.js');

const parseEntrypoint = (entrypoint: string): Entrypoint => {
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
function makeFilePathRelativeToCwd (file: string) {
  const cwd = process.cwd();
  return (file.startsWith(cwd)) ? '.' + file.substring(cwd.length) : file;
}

/**
 * @param {String} outputDir the directory that contains output files
 * @param {String[]} entryNames the entrypoint names from which output was produced
 */
async function zipOutputFiles (outputDir: string, entryNames: string[]) {
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

async function findIndexFile (dir: string) {
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

export interface Entrypoint {
  file: string;
  name: string;
}

async function expandEntrypoints (entrypoints: Entrypoint[]) {
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

export interface Config {
  entrypoint: string | string[];
  serviceName?: string;
  nodeVersion?: string;
  cacheDirectory?: boolean;
  enableDnsRetry?: boolean;
  outputPath?: string;
  enableRuntimeSourceMaps?: boolean;
  tsconfig?: string;
  minify?: boolean;
  configTransformer?: (config: webpack.Configuration) => webpack.Configuration;
  zip?: boolean;
}

export default async ({ entrypoint, serviceName = 'test-service', ...config }: Config) => {
  const options = defaults(config, { enableRuntimeSourceMaps: false });

  // If an entrypoint is a directory then we discover all of the entrypoints
  // within that directory.
  // For example, entrypoint might be "./src/lambdas" and we might discover
  // "./src/lambdas/abc/index.js" (a subdirectory with index file)
  // and "./src/lambdas/def.js" (a simple file)
  const entrypoints = await expandEntrypoints(flatten([entrypoint]).map(parseEntrypoint));

  const entry = entrypoints.reduce<Record<string, string[]>>(
    (accumulator, entry) => {
      const { file, name } = entry;
      const preloadModules = ['@babel/polyfill'];
      if (options.enableRuntimeSourceMaps) {
        preloadModules.push('source-map-support/register');
      }
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

  const babelLoader = {
    loader: 'babel-loader',
    options: {
      cacheDirectory: options.cacheDirectory,
      presets: [ babelEnvConfig ],
      plugins: []
    }
  };

  const tsRule = options.tsconfig
    ? {
      use: [
        babelLoader,
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
    ? { minimizer: [new TerserPlugin({ terserOptions: { sourceMap: true } })] }
    : { minimize: false };

  const devtool = options.enableRuntimeSourceMaps
    ? 'source-map'
    : 'hidden-source-map';

  const webpackConfig: webpack.Configuration = {
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
          ...babelLoader
        },
        {
          test: /\.ts$/,
          ...tsRule
        }
      ]
    },
    mode: (process.env.WEBPACK_MODE || 'production') as Mode,
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

  const transformer = options.configTransformer || function (config: webpack.Configuration) { return config; };
  const transformedConfig: webpack.Configuration = await transformer(webpackConfig);

  const webpackResult = await run(transformedConfig);

  handleWebpackResults(webpackResult);

  if (options.zip) {
    await zipOutputFiles(outputDir, Object.keys(entry));
  }

  return webpackResult;
};
