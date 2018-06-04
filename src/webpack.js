const assert = require('assert');
const babelEnvDeps = require('webpack-babel-env-deps');
const fs = require('fs');
const path = require('path');
const UglifyJsPlugin = require('uglifyjs-webpack-plugin');
const webpack = require('webpack');
const WrapperPlugin = require('wrapper-webpack-plugin');
const ZipPlugin = require('zip-webpack-plugin');

const { promisify } = require('util');
const run = promisify(webpack);

const CALLER_NODE_MODULES = 'node_modules';
const DEFAULT_NODE_VERSION = '6.10';
// eslint-disable-next-line security/detect-non-literal-fs-filename
const LAMBDA_PATCHES = fs.readFileSync(path.join(__dirname, 'lambda-patches.js'), { encoding: 'utf8' });
const LAMBDA_TOOLS_NODE_MODULES = path.resolve(__dirname, '..', 'node_modules');

const getNormalizedFileName = (file) => path.basename(file).replace(/.ts$/, '.js');

const parseEntrypoint = (entrypoint) => {
  const [ file, name ] = entrypoint.split(':');

  return {
    file: path.resolve(file),
    name: name || getNormalizedFileName(file)
  };
};

module.exports = async ({ entrypoint, serviceName = 'test-service', ...options }) => {
  const entrypoints = [].concat(entrypoint);
  assert(entrypoints.length <= 1 || !options.zip, 'Multiple entrypoints cannot be used with bundle zipping');

  const entry = entrypoints.reduce(
    (accumulator, entry) => {
      const { file, name } = parseEntrypoint(entry);
      // eslint-disable-next-line security/detect-object-injection
      accumulator[name] = ['@babel/polyfill', 'source-map-support/register', file];
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
    new WrapperPlugin({
      test: /\.js$/,
      footer: LAMBDA_PATCHES
    })
  ];

  if (options.zip) {
    plugins.push(new ZipPlugin());
  }

  const babelEnvConfig = [
    require('@babel/preset-env'),
    {
      targets: {
        node: nodeVersion
      }
    }
  ];

  const babelLoaderConfig = {
    exclude: [ babelEnvDeps.exclude({engines: {node: '>=' + nodeVersion}}) ],
    loader: 'babel-loader'
  };

  const config = {
    entry,
    output: {
      path: path.resolve(options.outputPath || process.cwd()),
      libraryTarget: 'commonjs',
      // Zipped bundles use explicit output names to determine the archive name
      filename: options.zip ? Object.keys(entry)[0] : '[name]'
    },
    devtool: 'source-map',
    plugins,
    module: {
      rules: [
        {
          loader: 'babel-loader',
          test: /\.js$/,
          options: {
            presets: [ babelEnvConfig ],
            plugins: [
              // X-Ray tracing cannot currently track execution across
              // async/await calls. The issue is tracked upstream at
              // https://github.com/aws/aws-xray-sdk-node/issues/12 Using
              // transform-async-to-generator will convert async/await into
              // generators which can be traced with X-Ray
              'transform-async-to-generator'
            ]
          }
        },
        {
          ...babelLoaderConfig,
          test: /\.ts$/,
          options: {
            presets: [
              babelEnvConfig,
              require('@babel/preset-typescript')
            ]
          }
        }
      ]
    },
    mode: process.env.WEBPACK_MODE || 'production',
    optimization: {
      // The default UglifyJsPlugin configuration seems to occaisionally create
      // bugs in minified code. This overrides that configuration. See:
      // - https://github.com/webpack/webpack/issues/7108
      // - https://github.com/graphql/graphiql/issues/665#issuecomment-381919771
      minimizer: [ new UglifyJsPlugin({ sourceMap: true,
        uglifyOptions: {
          compress: {
            // Work around https://github.com/mishoo/UglifyJS2/issues/2842
            inline: 1
          }
        }
      }) ]
    },
    resolve: {
      // Since build is being called by other packages dependencies may be
      // relative to the caller or us. This cause our node modules to be
      // searched if a dependency can't be found in the caller's.
      modules: [ CALLER_NODE_MODULES, LAMBDA_TOOLS_NODE_MODULES ],
      extensions: ['.js', '.ts']
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
      'dtrace-provider': 'dtrace-provider',
      'vertx': 'vertx'
    }
  };

  const transformer = options.configTransformer || function (config) { return config; };
  const transformedConfig = await transformer(config);

  return run(transformedConfig);
};
