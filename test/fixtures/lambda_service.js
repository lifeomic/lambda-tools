const Koa = require('koa');
const serverless = require('serverless-http');

const app = new Koa();

app.use((ctx) => {
  ctx.body = {
    service: 'lambda-test',
    parameter: process.env.TEST_PARAMETER
  };
});

module.exports.handler = serverless(app);
