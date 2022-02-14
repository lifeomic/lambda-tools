import Koa from 'koa';
import Router from 'koa-router';
import serverless from 'serverless-http';

const app = new Koa();
const router = new Router();

router.get('/', async (context, next) => {
  context.response.body = {
    service: 'lambda-test',
    parameter: process.env.TEST_PARAMETER,
  };
  await next();
});

app.use(router.routes());
export const handler = serverless(app);
