const Koa = require('koa');
const sinon = require('sinon');
const test = require('ava');

const { setupGraphQL, useGraphQL } = require('../src/graphql');
const { ApolloServer, gql } = require('apollo-server-koa');

useGraphQL(test);

test.before(() => {
  setupGraphQL((test) => {
    const app = new Koa();

    test.context.defaultValue = sinon.stub().returns('default');

    const graphql = new ApolloServer({
      context: ({ ctx }) => ({
        defaultValue: test.context.defaultValue,
        header: ctx.get('test-header')
      }),
      resolvers: {
        Query: {
          value: (obj, args, context, info) => args.prompt + ': ' + (context.header || context.defaultValue())
        }
      },
      typeDefs: gql`
        type Query {
          value(prompt: String!): String!
        }
      `
    });

    graphql.applyMiddleware({ app });
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

test('The GraphQL helper allows making batch requests', async (test) => {
  const query = [
    {
      query: 'query GetValue{ value(prompt: "prompt1") }'
    },
    {
      query: 'query GetValue{ value(prompt: "prompt2") }'
    }
  ];

  // const variables = { prompt: 'value' };
  const response = await test.context.graphql(query);

  test.is(response.status, 200);
  test.is(response.type, 'application/json');
  test.falsy(response.body[0].errors);
  test.falsy(response.body[1].errors);
  test.truthy(response.body[0].data);
  test.truthy(response.body[1].data);
  test.is(response.body[0].data.value, 'prompt1: default');
  test.is(response.body[1].data.value, 'prompt2: default');
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
