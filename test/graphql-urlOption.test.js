const Koa = require('koa');
const convert = require('koa-convert');
const koaBodyParser = convert(require('koa-better-body')({ fields: 'body' }));
const Router = require('koa-router');
const test = require('ava');

const { setupGraphQL, useGraphQL } = require('../src/graphql');
const { graphqlKoa } = require('apollo-server-koa');
const { makeExecutableSchema } = require('graphql-tools');

const schema = makeExecutableSchema({
  resolvers: {
    Query: {
      value: () => ''
    }
  },
  typeDefs: `
    type Query {
      value: String!
    }
  `
});

const graphql = graphqlKoa((context) => ({
  schema
}));

const alternateUrl = '/graphql-alt';
useGraphQL(test, {url: alternateUrl});

test.before(() => {
  setupGraphQL((test) => {
    const app = new Koa();
    const router = new Router();

    router.post(alternateUrl, koaBodyParser, graphql);
    app.use(router.routes());

    return app;
  });
});

test('the useGraphQL url option can be used to change the path used in the tests', async (test) => {
  const query = '{ value }';

  const response = await test.context.graphql(query);

  test.is(response.status, 200);
  test.is(response.type, 'application/json');
  test.falsy(response.body.errors);
  test.truthy(response.body.data);
  test.is(response.body.data.value, '');
});
