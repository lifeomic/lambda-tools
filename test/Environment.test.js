const { Environment } = require('../src/Environment');
const test = require('ava');

test.serial('Setting an environment variable modifies the process state', async (test) => {
  const environment = new Environment();
  environment.set('foo', 'bar');

  try {
    test.is(process.env.foo, 'bar');
  } finally {
    delete process.env.foo;
  }
});

test.serial('Restoring a new environment variable unsets the variable', async (test) => {
  const environment = new Environment();
  environment.set('foo', 'bar');

  try {
    environment.restore();
    test.is(process.env.foo, undefined);
  } finally {
    delete process.env.foo;
  }
});

test.serial('Restoring an existing variable resets the variable', async (test) => {
  const environment = new Environment();
  process.env.foo = 'bar';

  try {
    environment.set('foo', 'baz');
    environment.restore();
    test.is(process.env.foo, 'bar');
  } finally {
    delete process.env.foo;
  }
});
