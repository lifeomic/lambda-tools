const Koa = require('koa');
const convert = require('koa-convert');
const koaBodyParser = convert(require('koa-better-body')({ fields: 'body' }));
const Router = require('koa-router');
const test = require('ava');

const { assertError, assertSuccess, setupGraphQL, useGraphQL } = require('../src/graphql');
const { graphqlKoa } = require('apollo-server-koa');
const { makeExecutableSchema } = require('graphql-tools');

const schema = makeExecutableSchema({
  resolvers: {
    Query: {
      error: (obj, args, context, info) => { throw new Error('boom!'); },
      success: (obj, args, context, info) => 'success!'
    }
  },
  typeDefs: `
    type Query {
      error: String!
      success: String!
    }
  `
});

const graphql = graphqlKoa((context) => ({
  context: {},
  schema
}));

useGraphQL(test);

test.before(() => {
  setupGraphQL(() => {
    const app = new Koa();
    const router = new Router();

    router.use(koaBodyParser);
    router.post('/graphql', graphql);
    app.use(router.routes());

    return app;
  });
});

test('assertSuccess does not throw on a successful response', async (test) => {
  const query = '{ success }';
  const response = await test.context.graphql(query);
  assertSuccess(response);
});

test('assertSuccess throws on a graphql error', async (test) => {
  const query = '{ error }';
  const response = await test.context.graphql(query);
  test.throws(() => assertSuccess(response), 'Did not succeed. Errors were boom!');
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
  test.throws(() => assertError(response, 'error', 'some other message'), `'boom!' == 'some other message'`);
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
