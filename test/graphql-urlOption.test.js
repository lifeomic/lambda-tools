const Koa = require('koa');
const test = require('ava');

const { setupGraphQL, useGraphQL } = require('../src/graphql');
const { ApolloServer, gql } = require('apollo-server-koa');

const graphql = new ApolloServer({
  resolvers: {
    Query: {
      value: () => ''
    }
  },
  typeDefs: gql`
    type Query {
      value: String!
    }
  `
});

const alternateUrl = '/graphql-alt';
useGraphQL(test, {url: alternateUrl});

test.before(() => {
  setupGraphQL((test) => {
    const app = new Koa();
    graphql.applyMiddleware({ app, path: alternateUrl });
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
