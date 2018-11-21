const Alpha = require('@lifeomic/alpha');
const assert = require('assert');
const Docker = require('dockerode');
const uuid = require('uuid/v4');
const webpack = require('./webpack');

const { executeContainerCommand, ensureImage } = require('./docker');
const { promisify } = require('util');

const LAMBDA_IMAGE = 'lambci/lambda:nodejs6.10';

const createEnvironmentVariables = (environment) => Object.entries(environment)
  .map(([ key, value ]) => `${key}=${value}`);

class Client extends Alpha {
  constructor ({ handler, container }) {
    const runner = new LambdaRunner(container, handler);

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
  constructor (container, handler) {
    this._container = container;
    this._docker = new Docker();
    this._handler = handler;
  }

  async invoke (event) {
    const command = await this._buildCommand(event);
    const container = await this._getContainer();
    const { stderr, stdout } = await executeContainerCommand(container, ...command);

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

exports.useNewContainer = ({ environment, mountpoint, handler, image, useComposeNetwork }) => {
  const network = useComposeNetwork ? `${process.env.COMPOSE_PROJECT_NAME}_default` : undefined;
  Object.assign(globalOptions, { environment, handler, image, mountpoint, network });
};

exports.useComposeContainer = ({ service, handler }) => {
  const container = `${process.env.COMPOSE_PROJECT_NAME}_${service}_1`;
  Object.assign(globalOptions, { container, handler });
};

async function createLambdaExecutionEnvironment (options) {
  const { environment = {}, image = LAMBDA_IMAGE, mountpoint, network: networkId } = options;

  assert(!(options.mountpoint && options.service), 'A mountpoint cannot be used with a compose service');

  const executionEnvironment = {};

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
  const {container, network} = environment;

  if (container) {
    await container.stop();
  }

  if (network) {
    await network.remove();
  }
}

exports.createLambdaExecutionEnvironment = createLambdaExecutionEnvironment;
exports.destroyLambdaExecutionEnvironment = destroyLambdaExecutionEnvironment;

exports.useLambda = (test, localOptions = {}) => {
  const impliedOptions = {};

  let executionEnvironment = null;

  const getOptions = () => {
    const options = Object.assign({}, globalOptions, impliedOptions, localOptions);
    return options;
  };

  test.before(async (test) => {
    executionEnvironment = await createLambdaExecutionEnvironment(getOptions());
    if (executionEnvironment.container) {
      impliedOptions.container = executionEnvironment.container.id;
    }
  });

  test.after.always(async (test) => {
    await destroyLambdaExecutionEnvironment(executionEnvironment);
  });

  test.beforeEach((test) => {
    const { container, handler } = getOptions();
    const client = new Client({ container, handler });

    client.graphql = (path, query, variables, config) => client.post(path, { query, variables }, config);
    test.context.lambda = client;
  });
};
