const Koa = require('koa');
const convert = require('koa-convert');
const koaBodyParser = convert(require('koa-better-body')({ fields: 'body' }));
const Router = require('koa-router');
const sinon = require('sinon');
const test = require('ava');

const { setupGraphQL, useGraphQL } = require('../src/graphql');
const { graphqlKoa } = require('apollo-server-koa');
const { makeExecutableSchema } = require('graphql-tools');

const schema = makeExecutableSchema({
  resolvers: {
    Query: {
      value: (obj, args, context, info) => args.prompt + ': ' + (context.header || context.defaultValue())
    }
  },
  typeDefs: `
    type Query {
      value(prompt: String!): String!
    }
  `
});

const graphql = graphqlKoa((context) => ({
  context: {
    defaultValue: context.defaultValue,
    header: context.request.get('test-header')
  },
  schema
}));

useGraphQL(test);

test.before(() => {
  setupGraphQL((test) => {
    const app = new Koa();
    const router = new Router();

    test.context.defaultValue = sinon.stub().returns('default');

    router.use(async (context, next) => {
      context.defaultValue = test.context.defaultValue;
      await next();
    });

    router.post('/graphql', koaBodyParser, graphql);
    app.use(router.routes());

    return app;
  });
});

test('Making a GraphQL query invokes the app', async (test) => {
  const query = `
    query GetValue ($prompt: String!) {
      value(prompt: $prompt)
    }
  `;

  const variables = { prompt: 'value' };
  const response = await test.context.graphql(query, variables);

  test.is(response.status, 200);
  test.is(response.type, 'application/json');
  test.falsy(response.body.errors);
  test.truthy(response.body.data);
  test.is(response.body.data.value, 'value: default');
});

test('A GraphQL request can be customized', async (test) => {
  const query = `
    query GetValue ($prompt: String!) {
      value(prompt: $prompt)
    }
  `;

  const variables = { prompt: 'value' };
  const request = test.context.graphql(query, variables);
  request.set('test-header', 'test value');

  const response = await request;

  test.is(response.status, 200);
  test.is(response.type, 'application/json');
  test.falsy(response.body.errors);
  test.truthy(response.body.data);
  test.is(response.body.data.value, 'value: test value');
});

test('The GraphQL helper allows the test context to be customized', async (test) => {
  const query = `
    query GetValue ($prompt: String!) {
      value(prompt: $prompt)
    }
  `;

  const variables = { prompt: 'value' };

  test.context.defaultValue.returns('custom value');
  const response = await test.context.graphql(query, variables);

  test.is(response.status, 200);
  test.is(response.type, 'application/json');
  test.falsy(response.body.errors);
  test.truthy(response.body.data);
  test.is(response.body.data.value, 'value: custom value');
  sinon.assert.calledOnce(test.context.defaultValue);
});
