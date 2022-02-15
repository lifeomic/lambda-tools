import anyTest, { TestFn } from 'ava';
import { getConnection } from '../../src/localstack';

const test = anyTest as TestFn<{ cleanup?: () => Promise<void> }>;

test.afterEach(async (t) => {
  if (t.context.cleanup) {
    await t.context.cleanup();
  }
});

[
  'light',
  'full',
  undefined,
].forEach((nameExtension) => {
  const nameTag = nameExtension as 'full' | 'light' | undefined;
  test.serial(`will use docker tag localstack/localstack${nameTag ? `-${nameTag}` : ''}:0.14.0`, async (t) => {
    const { mappedServices, cleanup } = await getConnection({ services: ['s3'], versionTag: '0.14.0', nameTag });
    const { isReady, client } = mappedServices.s3;
    t.context.cleanup = cleanup;
    await t.notThrowsAsync(isReady(client));
  });
});

