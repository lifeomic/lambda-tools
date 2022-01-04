import test from 'ava';
import Docker, { Container, ContainerInspectInfo } from 'dockerode';
import { dockerLocalstackReady } from '../../src/localstack';
import { ensureImage } from '../../src/docker';
import { v4 as uuid } from 'uuid';

const LOCALSTACK_IMAGE = 'localstack/localstack';

[
  '0.10.9',
  '0.11.6',
  '0.12.20',
  '0.13.2'
].forEach((versionTag) => {
  const docker = new Docker();
  let container: Container;
  let info: ContainerInspectInfo;

  test.before(async () => {
    const image = `${LOCALSTACK_IMAGE}:${versionTag}`;

    await ensureImage(docker, image);

    container = await docker.createContainer({
      HostConfig: {
        AutoRemove: true,
        PublishAllPorts: true,
        Binds: [ '/var/run/docker.sock:/var/run/docker.sock' ]
      },
      Image: image,
      Env: [
        `SERVICES=s3`,
      ]
    });

    await container.start();
    info = await container.inspect();
  });

  test.after(async () => {
    if (container) {
      await container.stop();
      // await container.remove();
    }
  });

  test.serial(`dockerLocalstackReady ${versionTag} by containerId`, async (t) => {
    await t.notThrowsAsync(dockerLocalstackReady(undefined, { containerId: container.id }));
  });

  test.serial(`dockerLocalstackReady ${versionTag} by name`, async (t) => {
    await t.notThrowsAsync(dockerLocalstackReady(undefined, { name: info.Name }));
  });

  test.serial(`dockerLocalstackReady ${versionTag} by image`, async (t) => {
    await t.notThrowsAsync(dockerLocalstackReady(undefined, { version: versionTag }));
  });
});

test.serial(`dockerLocalstackReady no matching images provided`, async (t) => {
  await t.notThrowsAsync(dockerLocalstackReady(undefined, { name: uuid() }));
});

