// Avoid crashing the lambda handler patching code by setting some environment that
// is usually provided by the Lambda function environment
process.env._HANDLER = 'async_with_arrow.test';

class Foo {
  async foo (bar) {
    (() => {
      this.bar = 'baz';
    })();
  }
}

// Execute the code to make sure it executes without an error after transpiling
new Foo().foo();
