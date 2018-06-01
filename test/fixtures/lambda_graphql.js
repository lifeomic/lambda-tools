const convert = require('koa-convert');
const Koa = require('koa');
const koaBodyParser = convert(require('koa-better-body')({ fields: 'body' }));
const Router = require('koa-router');
const serverless = require('serverless-http');

const { graphqlKoa } = require('apollo-server-koa');
const { makeExecutableSchema } = require('graphql-tools');

const app = new Koa();
const router = new Router();

const schema = makeExecutableSchema({
  resolvers: {
    Query: {
      value: (obj, args, context, info) => args.prompt + ': ' + context.header
    }
  },
  typeDefs: `
    type Query {
      value (prompt: String!): String!
    }
  `
});

const graphql = graphqlKoa((context) => ({
  context: {
    header: context.request.get('test-header')
  },
  schema
}));

router.post('/', koaBodyParser, graphql);
app.use(router.routes());
module.exports.handler = serverless(app);
