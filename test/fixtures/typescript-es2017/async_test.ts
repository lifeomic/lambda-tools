async function test (handler) {
  for (const entry of [1, 2]) {
    await handler(entry);
  }
}

export default test;
