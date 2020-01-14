const { default: PQueue } = require('p-queue');

const concurrency = process.env.LAMBDA_TOOLS_CONCURRENCY
  ? Number.parseInt(process.env.LAMBDA_TOOLS_CONCURRENCY, 10)
  : Number.POSITIVE_INFINITY;

const pQueue = new PQueue({ concurrency });

module.exports = {
  get pQueue () { return pQueue; }
};
