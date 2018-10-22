const assert = require('assert');
const map = require('lodash/map');
const isString = require('lodash/isString');
const supertest = require('supertest');

let setupGraphQL = () => {
  throw new Error('A test GraphQL endpoint has not been configured!');
};

/**
 *  Assert response contains error path/message
 *  @param {Object} response http graphql response object
 *  @param {String} path '.' deliminated path to graphql resolver
 *  @param {String|Function} messageTest test to be applied to error
 *    message. If string, exact match. If function, apply test function to
 *    error message.
 */
exports.assertError = (response, path, messageTest) => {
  assert(response.body.errors, 'Expected error but none found');

  // path isn't defined on schema type errors. Get first error in that case
  let error;
  if (path) {
    error = response.body.errors.find((error) =>
      (error.path || []).join('.') === path);
  } else {
    error = response.body.errors.find((error) =>
      error.path === path);
  }

  const errorPaths = map(response.body.errors, function (error) {
    if (error.path) {
      return error.path.join('.');
    } else {
      return '<root>';
    }
  });

  assert(error, `No error found with path '${path}'. The paths with errors were: ${errorPaths.join(',')}`);
  if (isString(messageTest)) {
    assert.equal(error.message, messageTest);
  } else {
    assert(messageTest(error.message), 'message did not match');
  }
};

exports.assertSuccess = (response) => {
  assert(response.statusCode >= 200 && response.statusCode < 300,
    `Did not succeed. HTTP status code was ${response.statusCode}` +
    ` and error was ${JSON.stringify(response.error, null, 2)}`);

  const errors = map(response.body.errors, err => {
    return {
      message: err.message,
      path: err.path && err.path.join('.')
    };
  });
  assert(!response.body.errors, 'Did not succeed. Errors were ' +
    `${JSON.stringify(errors, null, 2)}`);
};

exports.setupGraphQL = (func) => {
  setupGraphQL = func;
};

exports.useGraphQL = (test, options) => {
  const defaults = {
    url: '/graphql'
  };
  options = Object.assign({}, defaults, options);

  test.beforeEach((test) => {
    const app = setupGraphQL(test);
    assert(app, 'GraphQL setup must return a Koa application');
    const request = supertest(app.callback());

    test.context.graphql = (query, variables) => request.post(options.url)
      .send({ query, variables });
  });
};
