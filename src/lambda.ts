import { Alpha } from '@lifeomic/alpha';
import assert from 'assert';
import Docker from 'dockerode';
import { v4 as uuid } from 'uuid';
import tmp from 'tmp-promise';
import fs from 'fs-extra';
import unzip from 'unzipper';
import isObjectLike from 'lodash/isObjectLike';
import { promisify } from 'util';
import { Handler} from "aws-lambda";
import { AxiosRequestConfig } from "axios";
import { TestInterface } from "ava";
import flatten from 'lodash/flatten';

import { executeContainerCommand, ensureImage } from './docker';
import { getLogger } from './utils/logging';

import webpack from './webpack';

const logger = getLogger('lambda');

const LAMBDA_TOOLS_WORK_PREFIX = '.lambda-tools-work';

const LAMBDA_IMAGE = 'lambci/lambda:nodejs12.x';

export interface Environment {
  [key: string]: string | number | boolean | null | undefined;
}

interface FinalConfig {
  container: string;
  environment?: Environment;
  handler: string;
  image?: string;
  mountpoint?: string;
  zipfile?: string;
  mountpointParent?: string;
  network?: string;
  service?: string;
}

export type LambdaConfigOptions = Partial<FinalConfig>;

// null or undefined value means 'delete this variable'. Docker deletes variables that only have the key, without '=value'
const createEnvironmentVariables = (environment: Environment) => Object.entries(environment)
  .map(([ key, value ]) => value === null || value === undefined ? key : `${key}=${value}`);

const convertEvent = (event?: any) => {
  if (isObjectLike(event)) {
    return JSON.stringify(event);
  }
  return `${event}`;
};

export async function destroyLambdaExecutionEnvironment (environment: ExecutionEnvironment) {
  if (!environment) {
    return;
  }
  const { container, network, cleanupMountpoint } = environment;

  if (cleanupMountpoint) {
    await cleanupMountpoint();
  }

  if (container) {
    await container.stop();
    logger.debug(`Stopped container ${container.id}`);
  }

  if (network) {
    await network.remove();
    logger.debug(`Removed network ${network.id}`);
  }
}

export async function getEntrypoint (docker: Docker, imageName: string): Promise<string[]> {
  const image = await docker.getImage(imageName).inspect();
  const entryPoint = image.ContainerConfig.Entrypoint ?? image.Config.Entrypoint;

  if (entryPoint) {
    return flatten([entryPoint]);
  } else {
    const parentImageName = image.Parent;
    assert(parentImageName, `The image ${imageName} has no entrypoint and no parent image`);
    return getEntrypoint(docker, parentImageName);
  }
}

export class LambdaRunner {
  private environment: string[];
  private docker: Docker;

  constructor (private container: string, environment: Environment | undefined, private handler: string) {
    this.docker = new Docker();
    this.environment = environment ? createEnvironmentVariables(environment) : [];
    this.environment.push('DOCKER_LAMBDA_USE_STDIN=1');
  }

  async invoke (event?: any) {
    const command = await this.buildCommand();
    const container = await this.getContainer();
    const environment = this.environment;

    const { stderr, stdout } = event === undefined
      ? { stdout: 'Skipping execution of an undefined event. In the past this would have been an Unexpected token error\n{}', stderr: '' }
      : await executeContainerCommand({ container, command, environment, stdin: convertEvent(event) });

    const output = stdout.toString('utf8').trim();
    const split = output.lastIndexOf('\n');
    const result = output.substring(split + 1);

    logger.debug('container output was:\n', output);
    logger.debug('container error was:\n', stderr.toString('utf8').trim());
    // istanbul ignore next
    return JSON.parse(result || '{}');
  }

  private async buildCommand (): Promise<string[]> {
    const container = await this.getContainer();
    const description = await container.inspect();
    const entrypoint = await getEntrypoint(this.docker, description.Image);

    return entrypoint.slice().concat(
      this.handler
    );
  }

  private async getContainer () {
    return this.docker.getContainer(this.container);
  }
}


export interface AlphaClientConfig {
  container: string;
  environment?: Environment;
  handler: string;
}

export class AlphaClient extends Alpha {
  public raw: Handler;
  constructor ({ container, environment, handler }: AlphaClientConfig) {
    const runner = new LambdaRunner(container, environment, handler);

    const fn: Handler = async function handler (event, context, callback) {
      try {
        callback(null, await runner.invoke(event));
      } catch (error) {
        callback(error);
      }
    };

    super(fn as any);
    this.raw = promisify(fn);
  }

  graphql<T = any> (
    path: string,
    query: any,
    variables: any,
    config?: AxiosRequestConfig
  ) {
    return this.post<T>(path, { query, variables }, config);
  }
}

const globalOptions: LambdaConfigOptions = {};

export const getGlobalOptions = () => Object.assign({}, globalOptions);

export const build = webpack;

async function buildMountpointFromZipfile (zipfile: string, mountpointParent?: string) {
  // It would be simpler if the standard TMPDIR directory could be used
  // to extract the zip files, but Docker on Mac is often not configured with
  // access to the Mac's /var temp directory location
  const baseDir = mountpointParent || process.cwd();
  const tempDir = await tmp.dir({ dir: baseDir, mode: 0o755, prefix: LAMBDA_TOOLS_WORK_PREFIX });
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
      const endOnError = (error: Error) => reject(error);
      unzipper.on('close', () => resolve(undefined));
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

export const useNewContainer = (
  {
    environment,
    mountpoint,
    zipfile,
    mountpointParent,
    handler,
    image,
    useComposeNetwork
  }:
    Pick<LambdaConfigOptions,
      'environment' |
      'mountpoint' |
      'zipfile' |
      'mountpointParent' |
      'handler' |
      'image'
      >
    & { useComposeNetwork?: boolean}
) => {
  const network = useComposeNetwork ? `${process.env.COMPOSE_PROJECT_NAME}_default` : undefined;
  Object.assign(globalOptions, { environment, handler, image, mountpoint, zipfile, mountpointParent, network });
};

export const useComposeContainer = ({ environment, service, handler }: Pick<LambdaConfigOptions, 'environment' | 'handler'> & {service: string}) => {
  const container = `${process.env.COMPOSE_PROJECT_NAME}_${service}_1`;
  Object.assign(globalOptions, { container, environment, handler });
};

interface ExecutionEnvironment {
  cleanupMountpoint?: () => Promise<any>;
  network?: Docker.Network;
  container?: Docker.Container;
}

export async function createLambdaExecutionEnvironment (options: FinalConfig): Promise<ExecutionEnvironment> {
  const { environment = {}, image = LAMBDA_IMAGE, zipfile, network: networkId, mountpointParent } = options;
  let { mountpoint } = options;

  if (mountpoint && zipfile) {
    throw new Error('Only one of mountpoint or zipfile can be provided');
  }
  const executionEnvironment: ExecutionEnvironment = {};

  if (zipfile) {
    const zipMount = await buildMountpointFromZipfile(zipfile, mountpointParent);
    mountpoint = zipMount.mountpoint;
    executionEnvironment.cleanupMountpoint = zipMount.cleanup;
  }

  assert(!(mountpoint && options.service), 'A mountpoint cannot be used with a compose service');

  if (mountpoint) {
    const docker = new Docker();
    try {
      await ensureImage(docker, image);
    } catch (error) {
      logger.error('Unable to get image', JSON.stringify({ error }, null, 2));
      await destroyLambdaExecutionEnvironment(executionEnvironment);
      throw error;
    }

    try {
      if (!networkId) {
        executionEnvironment.network = await docker.createNetwork({
          Internal: true,
          Name: uuid()
        });
        logger.debug(`Created network ${executionEnvironment.network!.id}`)
      }
    } catch (error) {
      logger.error('Unable to create network', JSON.stringify({ error }, null, 2));
      await destroyLambdaExecutionEnvironment(executionEnvironment);
      throw error;
    }

    try {
      executionEnvironment.container = await docker.createContainer({
        Entrypoint: 'sh',
        Env: createEnvironmentVariables(environment),
        HostConfig: {
          AutoRemove: true,
          Binds: [
            `${mountpoint}:/var/task`,
          ],
          NetworkMode: networkId || executionEnvironment.network!.id,
        },
        Image: image,
        OpenStdin: true,
        Volumes: {
          '/var/task': {},
        },
      });
      logger.debug(`Created container ${executionEnvironment.container.id}`)
    } catch (error) {
      logger.error('Unable to create container', JSON.stringify({ error }, null, 2));
      await destroyLambdaExecutionEnvironment(executionEnvironment);
      throw error;
    }

    try {
      await executionEnvironment.container.start();
    } catch (error) {
      logger.error('Unable to start container', JSON.stringify({ error, container: executionEnvironment.container.id }, null, 2));
      await destroyLambdaExecutionEnvironment(executionEnvironment);
      throw error;
    }
  }

  return executionEnvironment;
}

export interface LambdaHooks {
  beforeAll(): Promise<void>;
  beforeEach(): Promise<AlphaClient>;
  afterAll(): Promise<void>;
}

export function useLambdaHooks (localOptions: LambdaConfigOptions): LambdaHooks {
  const impliedOptions: Partial<FinalConfig> = {};

  let executionEnvironment: ExecutionEnvironment = {};

  const getOptions = (): FinalConfig => Object.assign<{}, LambdaConfigOptions, LambdaConfigOptions, LambdaConfigOptions>({}, globalOptions, impliedOptions, localOptions) as FinalConfig;

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
    return new AlphaClient({ container, environment, handler });
  }

  return { beforeAll, beforeEach, afterAll };
}

export interface LambdaTestContext {
  lambda: AlphaClient;
}

export const useLambda = (anyTest: TestInterface, localOptions: LambdaConfigOptions = {}) => {
  // The base ava test doesn't have context, and has to be cast.
  // This allows clients to send in the default ava export, and they can cast later or before.
  const test = anyTest as TestInterface<LambdaTestContext>;
  const hooks = useLambdaHooks(localOptions);

  test.serial.before(async () => {
    await hooks.beforeAll();
  });

  test.serial.after.always(async () => {
    await hooks.afterAll();
  });

  test.serial.beforeEach(async (test) => {
    test.context.lambda = await hooks.beforeEach();
  });
};
