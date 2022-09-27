const test = require('ava');
const sinon = require('sinon');
const Dockerode = require('dockerode');
const { getEntrypoint } = require('../../src/lambda');

test.afterEach(() => {
  sinon.restore();
});

test.serial('should fail to get entrypoint', async (test) => {
  const imageName = 'random';
  const errorMessage = `The image ${imageName} has no entrypoint and no parent image`;
  const containerStub = sinon.createStubInstance(Dockerode.Container, {
    inspect: sinon.stub().resolves({ Image: imageName })
  });
  const imageStub = sinon.createStubInstance(Dockerode.Image, {
    inspect: sinon.stub().resolves({
      Config: {},
      ContainerConfig: {}
    })
  });
  const dockerStub = sinon.createStubInstance(Dockerode, {
    getContainer: sinon.stub().resolves(containerStub),
    getImage: sinon.stub().returns(imageStub)
  });

  const error = await test.throwsAsync(getEntrypoint(dockerStub, imageName));

  test.is(error.message, errorMessage);
});

test.serial('should return the entry point', async (test) => {
  const imageName = 'random';
  const entryPoint = ['hello', 'entrypoint'];
  const containerStub = sinon.createStubInstance(Dockerode.Container, {
    inspect: sinon.stub().resolves({ Image: imageName })
  });
  const imageStub = sinon.createStubInstance(Dockerode.Image, {
    inspect: sinon.stub().resolves({
      Config: {
        Entrypoint: entryPoint
      },
      ContainerConfig: {}
    })
  });
  const dockerStub = sinon.createStubInstance(Dockerode, {
    getContainer: sinon.stub().resolves(containerStub),
    getImage: sinon.stub().returns(imageStub)
  });

  const result = await getEntrypoint(dockerStub, imageName);

  test.deepEqual(result, entryPoint);
});
