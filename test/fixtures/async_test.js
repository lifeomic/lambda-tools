async function test (handler) {
  const obj = {
    one: 1,
    two: 2
  };

  for (const entry of obj) {
    await handler(entry);
  }
}

module.exports = test;
