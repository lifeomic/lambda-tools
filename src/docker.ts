import assert from 'assert';
import Docker, { ExecCreateOptions } from 'dockerode';
import os from 'os';
import { WriteBuffer } from './WriteBuffer';
import map from 'lodash/map';
import flatten from 'lodash/flatten';
import { getLogger } from './utils/logging';
import { IncomingMessage } from 'http';

const DEFAULT_IMAGE = 'alpine:3.6';
const DEFAULT_ROUTE_PATTERN = /^default\b.*$/m;
const INTERFACE_ADDRESS_PATTERN = /\binet addr:\d{1,3}\.\d{1,3}.\d{1,3}\.\d{1,3}\b/m;

const logger = getLogger('docker');

export interface ExecuteCommandConfig {
  container: Docker.Container;
  command: string[];
  environment?: string[];
  stdin?: string;
}

export const executeContainerCommand = async ({ container, command, environment, stdin }: ExecuteCommandConfig) => {
  const options: ExecCreateOptions = {
    AttachStderr: true,
    AttachStdout: true,
    Cmd: command,
  };

  const usingStdin = stdin !== undefined;

  if (environment) {
    options.Env = environment;
  }

  if (usingStdin) {
    options.AttachStdin = true;
  }

  const exec = await container.exec(options);

  const stderr = new WriteBuffer();
  const stdout = new WriteBuffer();
  const stream = await exec.start(usingStdin ? { stdin: true, hijack: true } : {});
  if (usingStdin) {
    stream.end(Buffer.from(stdin!));
  }
  container.modem.demuxStream(stream, stdout, stderr);
  await new Promise((resolve, reject) => {
    stream.once('end', resolve);
    stream.once('error', reject);
  });
  const inspectOutput = await exec.inspect();
  return { stderr, stdout, inspectOutput };
};

const getDefaultInterface = (routeTable: string) => {
  const route = routeTable.match(DEFAULT_ROUTE_PATTERN);
  assert(route && route.length, 'Failed to parse route table for host');

  const columns = route![0].split(/\s+/);
  assert(columns.length > 7, 'Failed to parse default route');
  return columns[7];
};

const getInterfaceAddress = (ifconfig: string) => {
  const match = ifconfig.match(INTERFACE_ADDRESS_PATTERN);
  assert(match && match.length, 'Failed to parse interface configuration');
  return match![0].split(':')[1];
};

const buildAuthForDocker = () => {
  const dockerUser = process.env.DOCKER_HUB_USER;
  const dockerPass = process.env.DOCKER_HUB_PASS;
  if (dockerUser && dockerPass) {
    logger.debug(`Pulling image as ${dockerUser}`);
    return {
      authconfig: {
        username: dockerUser,
        password: dockerPass,
      },
    };
  }

  logger.debug('Pulling image as anon');
  return {};
};

export const pullImage = async (docker: Docker, image: string) => {
  const stream = (await docker.pull(image, buildAuthForDocker())) as IncomingMessage;
  await new Promise((resolve, reject) => {
    docker.modem.followProgress(stream, resolve, (progress: {status: string; progress?: string, error?: string}) => {
      if (progress.error) {
        const error = `${image}: Error: ${progress.error}`;
        logger.error(error);
        reject(new Error(error));
      } else {
        logger.debug(`${image}: ${progress.status}${progress.progress ? ` ${progress.progress}` : ''}`);
      }
    });
  });
};

export const imageExists = async (docker: Docker, image: string) => {
  const images = await docker.listImages();
  const imageTags = flatten(map(images, 'RepoTags'));
  return imageTags.includes(image);
};

export const ensureImage = async (docker: Docker, image: string) => {
  if (!await imageExists(docker, image)) {
    await pullImage(docker, image);
  }
};

export const getHostAddress = async () => {
  if (process.env.DOCKER_HOST_ADDR) {
    return process.env.DOCKER_HOST_ADDR;
  }

  // Docker on Mac runs in a VM. This makes the networking messy... We really
  // only need the host address for the builds.
  if (os.type() === 'Darwin') {
    return '127.0.0.1';
  }

  const docker = new Docker();
  await ensureImage(docker, DEFAULT_IMAGE);

  const container = await docker.createContainer({
    Entrypoint: 'sh',
    HostConfig: {
      AutoRemove: true,
      NetworkMode: 'host',
      UsernsMode: 'host',
    },
    Image: DEFAULT_IMAGE,
    OpenStdin: true,
  });

  await container.start();
  logger.debug(`Started container ${container.id}`);

  try {
    const { stdout: routeTable } = await executeContainerCommand({ container, command: ['route'] });
    const defaultInterface = getDefaultInterface(routeTable.toString('utf8'));

    const { stdout: ifconfig } = await executeContainerCommand({ container, command: ['ifconfig', defaultInterface] });
    return getInterfaceAddress(ifconfig.toString('utf8'));
  } finally {
    await container.stop();
    logger.debug(`Stopped container ${container.id}`);
  }
};
