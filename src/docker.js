const assert = require('assert');
const Docker = require('dockerode');
const os = require('os');
const { WriteBuffer } = require('./WriteBuffer');
const map = require('lodash/map');
const flatten = require('lodash/flatten');

const DEFAULT_IMAGE = 'alpine:3.6';
const DEFAULT_ROUTE_PATTERN = /^default\b.*$/m;
const INTERFACE_ADDRESS_PATTERN = /\binet addr:\d{1,3}\.\d{1,3}.\d{1,3}\.\d{1,3}\b/m;

const { getLogger } = require('./utils/logging');
const logger = getLogger('docker');

const executeContainerCommand = async ({ container, command, environment, stdin }) => {
  const options = {
    AttachStderr: true,
    AttachStdout: true,
    Cmd: command
  };

  const usingStdin = stdin !== undefined;

  if (environment) {
    options.Env = environment;
  }

  if (usingStdin) {
    options.AttachStdin = true;
    options.StdinOnce = true;
  }

  const exec = await container.exec(options);

  const stderr = new WriteBuffer();
  const stdout = new WriteBuffer();
  await exec.start(usingStdin ? { stdin: true, hijack: true } : undefined);
  if (usingStdin) {
    exec.output.end(Buffer.from(stdin));
  }
  container.modem.demuxStream(exec.output, stdout, stderr);
  await new Promise((resolve, reject) => {
    exec.output.once('end', resolve);
    exec.output.once('error', reject);
  });
  const inspectOutput = await exec.inspect();
  return { stderr, stdout, inspectOutput };
};

const getDefaultInterface = (routeTable) => {
  const route = routeTable.match(DEFAULT_ROUTE_PATTERN);
  assert(route && route.length, 'Failed to parse route table for host');

  const columns = route[0].split(/\s+/);
  assert(columns.length > 7, 'Failed to parse default route');
  return columns[7];
};

const getInterfaceAddress = (ifconfig) => {
  const match = ifconfig.match(INTERFACE_ADDRESS_PATTERN);
  assert(match && match.length, 'Failed to parse interface configuration');
  return match[0].split(':')[1];
};

const pullImage = async (docker, image) => {
  const stream = await docker.pull(image);
  await new Promise(async (resolve, reject) => {
    docker.modem.followProgress(stream, resolve, (progress) => {
      logger.debug(`${image}: ${progress.status} ${progress.progress ? progress.progress : ''}`);
    });
  });
};

const imageExists = async (docker, image) => {
  const images = await docker.listImages();
  const imageTags = flatten(map(images, 'RepoTags'));
  return imageTags.includes(image);
};

exports.executeContainerCommand = executeContainerCommand;

exports.getHostAddress = async () => {
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
      UsernsMode: 'host'
    },
    Image: DEFAULT_IMAGE,
    OpenStdin: true
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

exports.pullImage = pullImage;
exports.imageExists = imageExists;

const ensureImage = async (docker, image) => {
  if (!await imageExists(docker, image)) {
    await pullImage(docker, image);
  }
};

exports.ensureImage = ensureImage;
