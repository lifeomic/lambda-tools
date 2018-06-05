class Foo {
  async foo (bar) {
    (() => {
      this.bar = 'baz';
    })();
  }
}

// Execute the code to make sure it executes without an error after transpiling
exports.handle = function (event, context, callback) {
  new Foo().foo();
  callback(null, {});
};
