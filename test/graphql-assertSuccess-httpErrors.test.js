const Koa = require('koa');
const Router = require('koa-router');
const test = require('ava');

const { assertSuccess, setupGraphQL, useGraphQL } = require('../src/graphql');

useGraphQL(test);

test.before(() => {
  setupGraphQL(() => {
    const app = new Koa();
    const router = new Router();

    app.use(router.routes());

    return app;
  });
});

test('assertSuccess throws on an HTTP error', async (test) => {
  const query = '{ error }';
  const response = await test.context.graphql(query);
  test.throws(() => assertSuccess(response), 'Did not succeed. HTTP status code was 404');
});
