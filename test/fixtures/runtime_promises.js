exports.handler = async (event, context) => {
  await new Promise((resolve) => setImmediate(resolve));
  return 'hello from the promised land!';
};
