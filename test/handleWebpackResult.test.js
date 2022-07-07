const test = require('ava');
const { handleWebpackResults } = require('../src/handleWebpackResult');

test('Throw error if webpack result hasErrors() returns true', (test) => {
  const err = test.throws(() => {
    handleWebpackResults({
      hasErrors: () => {
        return true;
      }
    });
  });

  test.is(err.message, 'compilation_error');
});

test('Throw error if webpack does not return a result', (test) => {
  const err = test.throws(() => {
    handleWebpackResults();
  });

  test.is(err.message, 'no_result_error');
});
