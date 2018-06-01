#!/usr/bin/env node

const { getHostAddress } = require('../src/docker');

getHostAddress()
  .then(console.log)
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
