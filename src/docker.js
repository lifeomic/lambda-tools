const assert = require('assert');
const Docker = require('dockerode');
const os = require('os');
const WriteBuffer = require('./WriteBuffer');
const map = require('lodash/map');
const flatten = require('lodash/flatten');

const { promisify } = require('util');

const DEFAULT_IMAGE = 'alpine:3.6';
const DEFAULT_ROUTE_PATTERN = /^default\b.*$/m;
const INTERFACE_ADDRESS_PATTERN = /\binet addr:\d{1,3}\.\d{1,3}.\d{1,3}\.\d{1,3}\b/m;

const executeContainerCommand = async (container, ...command) => {
  const exec = await container.exec({
    AttachStderr: true,
    AttachStdout: true,
    Cmd: command
  });

  const stderr = new WriteBuffer();
  const stdout = new WriteBuffer();
  await exec.start();
  container.modem.demuxStream(exec.output, stdout, stderr);
  await new Promise((resolve, reject) => {
    exec.output.once('end', resolve);
    exec.output.once('error', reject);
  });

  return { stderr, stdout };
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
  const followProgress = promisify(docker.modem.followProgress);
  await followProgress(await docker.pull(image));
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
      NetworkMode: 'host'
    },
    Image: DEFAULT_IMAGE,
    OpenStdin: true
  });

  await container.start();

  try {
    const { stdout: routeTable } = await executeContainerCommand(container, 'route');
    const defaultInterface = getDefaultInterface(routeTable.toString('utf8'));

    const { stdout: ifconfig } = await executeContainerCommand(container, 'ifconfig', defaultInterface);
    return getInterfaceAddress(ifconfig.toString('utf8'));
  } finally {
    // Don't wait for the container to stop (this can take a while).
    container.stop();
  }
};

exports.pullImage = pullImage;

const ensureImage = async (docker, image) => {
  if (!await imageExists(docker, image)) {
    await pullImage(docker, image);
  }
};

exports.ensureImage = ensureImage;
