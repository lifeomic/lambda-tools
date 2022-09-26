const test = require('ava');
const sinon = require('sinon');
const Dockerode = require('dockerode');
const { useLambdaHooks } = require('../../src/lambda');

test.afterEach(() => {
  sinon.restore();
});

test.serial('should fail to get entrypoint', async (test) => {
  const imageName = 'random';
  const errorMessage = `The image ${imageName} has no entrypoint and no parent image`;
  const containerInspectStub = sinon.stub(Dockerode.Container.prototype, 'inspect').resolves({ Image: imageName });
  const imageInspectStub = sinon.stub(Dockerode.Image.prototype, 'inspect').resolves({
    Config: {},
    ContainerConfig: {}
  });
  sinon.stub(Dockerode.prototype, 'getContainer').resolves({ inspect: containerInspectStub });
  sinon.stub(Dockerode.prototype, 'getImage').returns({ inspect: imageInspectStub });
  const { beforeEach } = useLambdaHooks(test);

  const client = await beforeEach();

  const error = await test.throwsAsync(client.raw({}, {}));

  test.is(error.message, errorMessage);
});
