const Alpha = require('@lifeomic/alpha');
const assert = require('assert');
const Docker = require('dockerode');
const uuid = require('uuid/v4');
const webpack = require('./webpack');
const tmp = require('tmp-promise');
const fs = require('fs-extra');
const unzip = require('unzipper');

const { executeContainerCommand, ensureImage } = require('./docker');
const { promisify } = require('util');

const LAMBDA_TOOLS_WORK_PREFIX = '.lambda-tools-work';

const LAMBDA_IMAGE = 'lambci/lambda:nodejs6.10';

// null value means 'delete this variable'. Docker deletes variables that only have the key, without '=value'
const createEnvironmentVariables = (environment) => Object.entries(environment)
  .map(([ key, value ]) => value === null ? key : `${key}=${value}`);

class Client extends Alpha {
  constructor ({ container, environment, handler }) {
    const runner = new LambdaRunner(container, environment, handler);

    const fn = async function handler (event, context, callback) {
      try {
        callback(null, await runner.invoke(event));
      } catch (error) {
        callback(error);
      }
    };

    super(fn);
    this.raw = promisify(fn);
  }
}

async function getEntrypoint (docker, imageName) {
  const image = await (await docker.getImage(imageName)).inspect();

  if (image.ContainerConfig.Entrypoint) {
    return image.ContainerConfig.Entrypoint;
  } else {
    const parentImageName = image.Parent;
    assert(parentImageName, `The image ${imageName} has no entrypoint and no parent image`);
    return getEntrypoint(docker, parentImageName);
  }
}

class LambdaRunner {
  constructor (container, environment, handler) {
    this._container = container;
    this._docker = new Docker();
    this._environment = environment ? createEnvironmentVariables(environment) : null;
    this._handler = handler;
  }

  async invoke (event) {
    const command = await this._buildCommand(event);
    const container = await this._getContainer();
    const environment = this._environment;
    const { stderr, stdout } = await executeContainerCommand({container, command, environment});

    const output = stdout.toString('utf8').trim();
    const split = output.lastIndexOf('\n');
    const result = output.substring(split + 1);

    if (process.env.ENABLE_LAMBDA_LOGGING) {
      console.log('container output was:\n', output);
      console.log('container error was:\n', stderr.toString('utf8').trim());
    }

    return JSON.parse(result);
  }

  async _buildCommand (event) {
    const container = await this._getContainer();
    const description = await container.inspect();
    const entrypoint = await getEntrypoint(this._docker, description.Image);

    return entrypoint.slice().concat(
      this._handler,
      JSON.stringify(event)
    );
  }

  async _getContainer () {
    return this._docker.getContainer(this._container);
  }
}

const globalOptions = {};

exports.build = webpack;
exports.LambdaRunner = LambdaRunner;

async function buildMountpointFromZipfile (zipfile, mountpointParent) {
  // It would be simpler if the standard TMPDIR directory could be used
  // to extract the zip files, but Docker on Mac is often not configured with
  // access to the Mac's /var temp directory location
  const baseDir = mountpointParent || process.cwd();
  const tempDir = await tmp.dir({ dir: baseDir, mode: '0755', prefix: LAMBDA_TOOLS_WORK_PREFIX });
  const tempDirName = tempDir.path;
  const cleanup = async () => {
    // Delete unzipped files
    await fs.emptyDir(tempDirName);
    await tempDir.cleanup();
  };

  try {
    // eslint-disable-next-line security/detect-non-literal-fs-filename
    const fsStream = fs.createReadStream(zipfile);
    const unzipper = fsStream.pipe(unzip.Extract({
      path: tempDirName
    }));

    await new Promise((resolve, reject) => {
      const endOnError = (error) => reject(error);
      unzipper.on('close', () => resolve());
      fsStream.on('error', endOnError);
      unzipper.on('error', endOnError);
    });

    return {
      mountpoint: tempDirName,
      cleanup
    };
  } catch (e) {
    await cleanup();
    throw e;
  }
}

exports.useNewContainer = ({ environment, mountpoint, zipfile, mountpointParent, handler, image, useComposeNetwork }) => {
  const network = useComposeNetwork ? `${process.env.COMPOSE_PROJECT_NAME}_default` : undefined;
  Object.assign(globalOptions, { environment, handler, image, mountpoint, zipfile, mountpointParent, network });
};

exports.useComposeContainer = ({ environment, service, handler }) => {
  const container = `${process.env.COMPOSE_PROJECT_NAME}_${service}_1`;
  Object.assign(globalOptions, { container, environment, handler });
};

async function createLambdaExecutionEnvironment (options) {
  const { environment = {}, image = LAMBDA_IMAGE, zipfile, network: networkId, mountpointParent } = options;
  let { mountpoint } = options;

  if (mountpoint && zipfile) {
    throw new Error('Only one of mountpoint or zipfile can be provided');
  }

  const executionEnvironment = {};

  if (zipfile) {
    const zipMount = await buildMountpointFromZipfile(zipfile, mountpointParent);
    mountpoint = zipMount.mountpoint;
    executionEnvironment.cleanupMountpoint = zipMount.cleanup;
  }

  assert(!(mountpoint && options.service), 'A mountpoint cannot be used with a compose service');

  if (mountpoint) {
    try {
      const docker = new Docker();
      await ensureImage(docker, image);

      if (!networkId) {
        executionEnvironment.network = await docker.createNetwork({
          Internal: true,
          Name: uuid()
        });
      }
      executionEnvironment.container = await docker.createContainer({
        Entrypoint: 'sh',
        Env: createEnvironmentVariables(environment),
        HostConfig: {
          AutoRemove: true,
          Binds: [
            `${mountpoint}:/var/task`
          ],
          NetworkMode: networkId || executionEnvironment.network.id
        },
        Image: image,
        OpenStdin: true,
        Volumes: {
          '/var/task': {}
        }
      });

      await executionEnvironment.container.start();
    } catch (error) {
      await destroyLambdaExecutionEnvironment(executionEnvironment);
      throw error;
    }
  }

  return executionEnvironment;
}

async function destroyLambdaExecutionEnvironment (environment) {
  const {container, network, cleanupMountpoint} = environment;

  if (cleanupMountpoint) {
    await cleanupMountpoint();
  }

  if (container) {
    await container.stop();
  }

  if (network) {
    await network.remove();
  }
}

exports.createLambdaExecutionEnvironment = createLambdaExecutionEnvironment;
exports.destroyLambdaExecutionEnvironment = destroyLambdaExecutionEnvironment;

function useLambdaHooks (localOptions) {
  const impliedOptions = {};

  let executionEnvironment = null;

  const getOptions = () => {
    const options = Object.assign({}, globalOptions, impliedOptions, localOptions);
    return options;
  };

  async function beforeAll () {
    executionEnvironment = await createLambdaExecutionEnvironment(getOptions());
    if (executionEnvironment.container) {
      impliedOptions.container = executionEnvironment.container.id;
    }
  }

  async function afterAll () {
    await destroyLambdaExecutionEnvironment(executionEnvironment);
  }

  async function beforeEach () {
    const { container, environment, handler } = getOptions();
    const client = new Client({ container, environment, handler });

    client.graphql = (path, query, variables, config) => client.post(path, { query, variables }, config);
    return client;
  }

  return { beforeAll, beforeEach, afterAll };
}

exports.useLambdaHooks = useLambdaHooks;

exports.useLambda = (test, localOptions = {}) => {
  const hooks = useLambdaHooks(localOptions);

  test.before(async () => {
    await hooks.beforeAll();
  });

  test.after.always(async () => {
    await hooks.afterAll();
  });

  test.beforeEach(async (test) => {
    test.context.lambda = await hooks.beforeEach();
  });
};
