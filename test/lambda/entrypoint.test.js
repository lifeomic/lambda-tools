const test = require('ava');
const sinon = require('sinon');
const Dockerode = require('dockerode');
const { getEntrypoint } = require('../../src/lambda');

test.afterEach(() => {
  sinon.restore();
});

test.serial('should fail to get entrypoint', async (test) => {
  const imageName = 'image';
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

test.serial('should not fail to get entrypoint', async (test) => {
  const imageName = 'image';
  const containerStub = sinon.createStubInstance(Dockerode.Container, {
    inspect: sinon.stub().resolves({ Image: imageName })
  });
  const imageInspectStub = sinon.stub();
  imageInspectStub.onFirstCall().resolves({
    Config: {},
    ContainerConfig: {},
    Parent: `parent-${imageName}`
  });
  imageInspectStub.onSecondCall().resolves({
    Config: {
      Entrypoint: ['hello', 'entrypoint']
    }
  });

  const imageStub = sinon.createStubInstance(Dockerode.Image, {
    inspect: imageInspectStub
  });
  const dockerStub = sinon.createStubInstance(Dockerode, {
    getContainer: sinon.stub().resolves(containerStub),
    getImage: sinon.stub().returns(imageStub)
  });

  await test.notThrowsAsync(getEntrypoint(dockerStub, imageName));
});
