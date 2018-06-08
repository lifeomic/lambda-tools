const test = require('ava');
const handleWebpackResult = require('../src/handleWebpackResult');

test('Throw error if webpack result hasErrors() returns true', (test) => {
  const err = test.throws(() => {
    handleWebpackResult({
      hasErrors: () => {
        return true;
      }
    });
  });

  test.is(err.message, 'compilation_error');
});
