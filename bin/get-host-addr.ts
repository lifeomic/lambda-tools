#!/usr/bin/env node

import { getHostAddress } from '../src/docker';

getHostAddress()
  // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
  .then((...args: any) => console.log(...args))
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
