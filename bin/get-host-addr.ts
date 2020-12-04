#!/usr/bin/env node

import { getHostAddress } from '../src/docker';

getHostAddress()
  .then(console.log.bind(console))
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
