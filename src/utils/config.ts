import PQueue from 'p-queue';

const concurrency = process.env.LAMBDA_TOOLS_CONCURRENCY
  ? Number.parseInt(process.env.LAMBDA_TOOLS_CONCURRENCY, 10)
  : Number.POSITIVE_INFINITY;

export const pQueue = new PQueue({ concurrency });
