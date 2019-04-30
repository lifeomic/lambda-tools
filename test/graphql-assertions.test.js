const Koa = require('koa');
const test = require('ava');

const { assertError, assertSuccess, setupGraphQL, useGraphQL } = require('../src/graphql');
const { ApolloServer, gql } = require('apollo-server-koa');

const graphql = new ApolloServer({
  resolvers: {
    Query: {
      error: (obj, args, context, info) => { throw new Error('boom!'); },
      success: (obj, args, context, info) => 'success!'
    }
  },
  typeDefs: gql`
    type Query {
      error: String!
      success: String!
    }
  `
});

useGraphQL(test);

test.before(() => {
  setupGraphQL(() => {
    const app = new Koa();
    graphql.applyMiddleware({ app });
    return app;
  });
});

// This is a work-around for a bug in ava. This should be remove when the fix
// is released in ava 1.0.0.
// See https://github.com/avajs/ava/pull/1885
test.beforeEach((test) => {
  test.context.isTTY = process.stdout.isTTY;
  process.stdout.isTTY = false;
});

test.afterEach((test) => {
  process.stdout.isTTY = test.context.isTTY;
});

test('assertSuccess does not throw on a successful response', async (test) => {
  const query = '{ success }';
  const response = await test.context.graphql(query);
  assertSuccess(response);
});

test('assertSuccess throws on a graphql error', async (test) => {
  const query = '{ error }';
  const response = await test.context.graphql(query);
  const expectedErrorMessage = `Did not succeed. Errors were [
  {
    "message": "boom!",
    "path": "error"
  }
]`;

  test.throws(() => assertSuccess(response), expectedErrorMessage);
});

test('assertError throws on a successful response', async (test) => {
  const query = '{ success }';
  const response = await test.context.graphql(query);
  test.throws(() => assertError(response), 'Expected error but none found');
});

test('assertError does not throw on a failed response', async (test) => {
  const query = '{ error }';
  const response = await test.context.graphql(query);
  assertError(response, 'error', 'boom!');
});

test('assertError throws if no error matches the path', async (test) => {
  const query = '{ error }';
  const response = await test.context.graphql(query);
  test.throws(() => assertError(response, 'some.other.path', 'boom!'), `No error found with path 'some.other.path'. The paths with errors were: error`);
});

test('assertError throws if the error does not match the message', async (test) => {
  const query = '{ error }';
  const response = await test.context.graphql(query);
  test.throws(() => assertError(response, 'error', 'some other message'), `'boom!' === 'some other message'`);
});

test('assertError throws if the path is undefined and no error has undefined path', test => {
  const response = {
    body: {
      errors: [ {message: 'foo', path: ['some', 'path']} ]
    }
  };
  test.throws(() => assertError(response, undefined, 'something'), `No error found with path 'undefined'. The paths with errors were: some.path`);
});

test('assertError doesn\'t throw on mixed path/no-path errors', test => {
  const response = {
    body: {
      errors: [
        {message: 'bar', path: undefined},
        {message: 'foo', path: ['some', 'path']}
      ]
    }
  };
  assertError(response, 'some.path', 'foo');
});

test('assertError can be called with a matcher function', async (test) => {
  const query = '{ error }';
  const response = await test.context.graphql(query);
  assertError(response, 'error', (msg) => msg.includes('boom'));
});
