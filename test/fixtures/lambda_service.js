const Koa = require('koa');
const Router = require('koa-router');
const serverless = require('serverless-http');

const app = new Koa();
const router = new Router();

router.get('/', async (context, next) => {
  context.response.body = {
    service: 'lambda-test',
    parameter: process.env.TEST_PARAMETER
  };
  await next();
});

app.use(router.routes());
module.exports.handler = serverless(app);
