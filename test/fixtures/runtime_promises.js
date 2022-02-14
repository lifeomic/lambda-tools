exports.handler = async () => {
  await new Promise((resolve) => setImmediate(resolve));
  return 'hello from the promised land!';
};
