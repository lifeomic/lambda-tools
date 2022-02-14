import test from 'ava';
import Docker, { Container, ContainerInspectInfo } from 'dockerode';
import { dockerLocalstackReady } from '../../src/localstack';
import { ensureImage } from '../../src/docker';
import { v4 as uuid } from 'uuid';

const LOCALSTACK_IMAGE = 'localstack/localstack';

const versions = [
  '0.10.9',
  '0.11.6',
  '0.12.20',
  '0.13.2',
  '0.14.0',
] as const;
const docker = new Docker();

const containers = {} as Record<typeof versions[number], { container: Container; info: ContainerInspectInfo }>;

test.before(async () => {
  await Promise.all(versions.map(async (versionTag) => {
    const image = `${LOCALSTACK_IMAGE}:${versionTag}`;

    await ensureImage(docker, image);

    const container = await docker.createContainer({
      HostConfig: {
        AutoRemove: true,
        PublishAllPorts: true,
        Binds: ['/var/run/docker.sock:/var/run/docker.sock'],
      },
      Image: image,
      Env: [
        'SERVICES=s3',
      ],
    });

    await container.start();

    const info = await container.inspect();
    containers[versionTag] = { info, container };
  }));
});

test.after(async () => {
  await Promise.all(versions.map(async (versionTag) => {
    const { container } = containers[versionTag];
    if (container) {
      await container.stop();
    }
  }));
});

versions.forEach((versionTag) => {
  test.serial(`dockerLocalstackReady ${versionTag} by containerId`, async (t) => {
    const { container } = containers[versionTag];
    await t.notThrowsAsync(dockerLocalstackReady({ containerId: container.id }));
  });

  test.serial(`dockerLocalstackReady ${versionTag} by name`, async (t) => {
    const { info } = containers[versionTag];
    await t.notThrowsAsync(dockerLocalstackReady({ name: info.Name }));
  });

  test.serial(`dockerLocalstackReady ${versionTag} by image`, async (t) => {
    await t.notThrowsAsync(dockerLocalstackReady({ version: versionTag }));
  });
});

test.serial('dockerLocalstackReady no matching images provided', async (t) => {
  await t.notThrowsAsync(dockerLocalstackReady({ name: uuid() }));
});

test('dockerLocalstackReady will throw an exception if missing parameters', async (t) => {
  // @ts-expect-error this is to satisfy plain javascript, where the compiler won't complain.
  await t.throwsAsync(dockerLocalstackReady({}), {
    message: '\'containerId\', \'name\' or \'version\' is required',
  });
});
