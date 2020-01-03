const test = require('ava');
const sinon = require('sinon');
const uuid = require('uuid/v4');
const docker = require('dockerode');

const { createLambdaExecutionEnvironment } = require('../../src/lambda');

test.beforeEach(t => {
  const errorSpy = sinon.spy(console, 'error');
  Object.assign(t.context, { stubbedMethods: [errorSpy], errorSpy });
});

test.afterEach(t => {
  t.context.stubbedMethods.forEach(method => method.restore());
});

test.serial('An error is thrown if both zipfile and mountpoint arguments are provided', async (test) => {
  await test.throwsAsync(() =>
    createLambdaExecutionEnvironment({
      environment: { AWS_XRAY_CONTEXT_MISSING: null },
      mountpoint: 'someMountPoint/',
      zipfile: 'some.zip'
    })
  , 'Only one of mountpoint or zipfile can be provided');
});

test.serial('Will throw an error if the image can\'t be fetched', async test => {
  const { errorSpy } = test.context;
  const error = await test.throwsAsync(createLambdaExecutionEnvironment({
    mountpoint: 'someMountPoint/',
    image: `junkity-junky/junk:${uuid()}`
  }), '(HTTP code 404) unexpected - pull access denied for junkity-junky/junk, repository does not exist or may require \'docker login\': denied: requested access to the resource is denied ');
  sinon.assert.calledOnce(errorSpy);
  sinon.assert.calledWithExactly(errorSpy, 'Unable to get image', JSON.stringify({ error }, null, 2));
});

test.serial('Will throw an error if the network can\'t be created', async test => {
  const { errorSpy } = test.context;
  const networkError = sinon.stub(docker.prototype, 'createNetwork');
  test.context.stubbedMethods.push(networkError);
  const errorMessage = `A new error: ${uuid()}`;

  networkError.rejects(errorMessage);

  const error = await test.throwsAsync(createLambdaExecutionEnvironment({
    mountpoint: 'invalidCharacters/'
  }));
  sinon.assert.calledOnce(errorSpy);
  sinon.assert.calledWithExactly(errorSpy, 'Unable to create network', JSON.stringify({ error }, null, 2));
});

test.serial('Will throw an error if the container can\'t be created', async test => {
  const { errorSpy } = test.context;
  const error = await test.throwsAsync(createLambdaExecutionEnvironment({
    mountpoint: 'invalidCharacters/',
    network: uuid()
  }));
  sinon.assert.calledOnce(errorSpy);
  sinon.assert.calledWithExactly(errorSpy, 'Unable to create container', JSON.stringify({ error }, null, 2));
});

test.serial('Will throw an error if the container can\'t start', async test => {
  const { errorSpy } = test.context;
  const createContainerStub = sinon.stub(docker.prototype, 'createContainer');
  test.context.stubbedMethods.push(createContainerStub);
  const errorMessage = `A new error: ${uuid()}`;
  createContainerStub.resolves({
    start: () => {
      throw new Error(errorMessage);
    }
  });

  const error = await test.throwsAsync(createLambdaExecutionEnvironment({
    mountpoint: 'invalidCharacters/',
    network: uuid()
  }));
  sinon.assert.calledOnce(errorSpy);
  sinon.assert.calledWithExactly(errorSpy, 'Unable to start container', JSON.stringify({ error }, null, 2));
});
