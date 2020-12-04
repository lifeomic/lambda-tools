const test = require('ava');

const index = require('../src');
const docker = require('../src/docker');
const dynamodb = require('../src/dynamodb');
const Environment = require('../src/Environment').default;
const graphql = require('../src/graphql');
const lambda = require('../src/lambda');
const localStack = require('../src/localstack');
const kinesis = require('../src/kinesis');
const mockServerLambda = require('../src/mockServerLambda');
const WriteBuffer = require('../src/WriteBuffer').default;

test('exports match expected', t => {
  t.deepEqual(index, {
    docker,
    dynamodb,
    Environment,
    graphql,
    lambda,
    localStack,
    kinesis,
    mockServerLambda,
    WriteBuffer
  });
});
