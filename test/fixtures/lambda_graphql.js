const Koa = require('koa');
const serverless = require('serverless-http');

const { ApolloServer, gql } = require('apollo-server-koa');

const app = new Koa();

const graphql = new ApolloServer({
  context: ({ ctx }) => ({
    header: ctx.request.get('test-header')
  }),
  resolvers: {
    Query: {
      value: (obj, args, context, info) => args.prompt + ': ' + context.header
    }
  },
  typeDefs: gql`
    type Query {
      value (prompt: String!): String!
    }
  `
});

graphql.applyMiddleware({ app, path: '/' });
module.exports.handler = serverless(app);
