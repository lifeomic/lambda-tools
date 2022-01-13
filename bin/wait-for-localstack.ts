#!/usr/bin/env node

import yargs from 'yargs';
import { dockerLocalstackReady } from '../src/localstack';

const { name, containerId, version } = yargs
  .usage('$0 [<options>]')
  .option('containerId', {
    alias: 'c',
    describe: 'the docker container ID to wait for',
    type: 'string',
  })
  .option('name', {
    alias: 'n',
    describe: 'the name given to the container to wait for',
    type: 'string',
  })
  .option('version', {
    alias: 'v',
    describe: 'the version of localstack to search active containers for',
    type: 'string',
  })
  .demandCommand(1)
  .argv;

// @ts-expect-error this is to satisfy plain javascript, where the compiler won't complain.
dockerLocalstackReady({ containerId, name, version }, {})
  .then(() => process.exit(0), (err) => {
    console.error(err);
    process.exitCode = 1;
  });
