import test from 'ava';

import * as index from '../src';

import * as docker from '../src/docker';
import * as dynamodb from '../src/dynamodb';
import { default as  Environment } from '../src/Environment';
import * as graphql from '../src/graphql';
import * as lambda from '../src/lambda';
import * as localStack from '../src/localstack';
import * as kinesis from '../src/kinesis';
import * as mockServerLambda from '../src/mockServerLambda';
import { default as WriteBuffer } from '../src/WriteBuffer';

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
})
