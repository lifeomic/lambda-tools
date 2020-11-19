const Docker = require('dockerode');
const proxyquire = require('proxyquire').noPreserveCache();
const sinon = require('sinon');
const test = require('ava');
const { v4: uuid } = require('uuid');

test.beforeEach((test) => {
  test.context.createContainer = sinon.spy(Docker.prototype, 'createContainer');
});

test.afterEach.always((test) => {
  test.context.createContainer.restore();
});

test.serial('If DOCKER_HOST_ADDR is set it is returned', async (test) => {
  const { getHostAddress } = require('../../src/docker');
  const expected = process.env.DOCKER_HOST_ADDR = uuid();

  try {
    const address = await getHostAddress();
    test.is(address, expected);
  } finally {
    delete process.env.DOCKER_HOST_ADDR;
  }

  sinon.assert.notCalled(test.context.createContainer);
});

test.serial('On Mac 127.0.0.1 is always returned', async (test) => {
  const { getHostAddress } = proxyquire(
    '../../src/docker',
    {
      os: {
        type: () => 'Darwin'
      }
    }
  );

  const address = await getHostAddress();
  test.is(address, '127.0.0.1');
  sinon.assert.notCalled(test.context.createContainer);
});

test.serial('On other platforms a "real" address is returned', async (test) => {
  const { getHostAddress } = proxyquire(
    '../../src/docker',
    {
      os: {
        type: () => 'Linux'
      }
    }
  );

  const address = await getHostAddress();
  test.regex(address, /\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}/);

  sinon.assert.calledOnce(test.context.createContainer);
  sinon.assert.calledWithExactly(test.context.createContainer, sinon.match({
    HostConfig: sinon.match({ NetworkMode: 'host' })
  }));
});
