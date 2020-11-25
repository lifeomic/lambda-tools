const test = require('ava');
const { createDefaultContainer } = require('../helpers/createDefaultContainer');
const { executeContainerCommand } = require('../../src/docker');

test('response includes stdout, stderr, and inspectOutput with ExitCode 0', async (t) => {
  const container = await createDefaultContainer();
  console.log(`Started container ${container.id}`);
  try {
    await container.start();
    const command = ['pwd'];
    const { inspectOutput, stderr, stdout } = await executeContainerCommand({ container, command });
    t.is(stdout.toString('utf8'), '/\n');
    t.is(stderr.toString('utf8'), '');
    t.is(inspectOutput.ExitCode, 0);
  } finally {
    await container.stop();
    console.log(`Stopped container ${container.id}`);
  }
});
