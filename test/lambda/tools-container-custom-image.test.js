const Docker = require('dockerode');
const sinon = require('sinon');
const test = require('ava');

const { useNewContainer, useLambda } = require('../../src/lambda');
const {FIXTURES_DIRECTORY} = require('../helpers/lambda');

let createContainer = null;

test.before((test) => {
  createContainer = sinon.spy(Docker.prototype, 'createContainer');
});

useLambda(test);

useNewContainer({
  handler: 'bundled_service.handler',
  image: 'lambci/lambda:nodejs8.10',
  mountpoint: FIXTURES_DIRECTORY
});

test.after.always((test) => {
  createContainer.restore();
});

test('Managed containers can use a custom image', async (test) => {
  const response = await test.context.lambda.get('/');
  test.is(response.status, 200);
  test.is(response.data.service, 'lambda-test');

  sinon.assert.calledWithExactly(
    createContainer,
    sinon.match({
      Image: 'lambci/lambda:nodejs8.10'
    })
  );
});
