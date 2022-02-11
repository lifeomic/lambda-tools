import assert from 'assert';
import map from 'lodash/map';
import isString from 'lodash/isString';
import supertest, { Test } from 'supertest';
import { ExecutionContext, TestInterface } from 'ava';

export type SetupContextGraphQl<Context extends GraphQLTestContext = GraphQLTestContext> = <T = any>(context: Context) => T;
export type SetupGraphQL = <Context extends GraphQLTestContext = GraphQLTestContext, T = any>(test: ExecutionContext<Context>) => T;

export interface GraphQLErrorLocation {
  line: number;
  column: number;
}

export interface GraphQLError {
  message: string;
  path: (string | number)[];
  locations: GraphQLErrorLocation[];
}

export interface GraphQlResponse {
  statusCode: number;
  error: any;
  body: {
    errors: GraphQLError[];
  };
}

let setupGraphQLFunc: SetupGraphQL = () => {
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
export const assertError = (response: GraphQlResponse, path: string | undefined, messageTest: (message: string) => boolean) => {
  assert(response.body.errors, 'Expected error but none found');

  // path isn't defined on schema type errors. Get first error in that case
  let error;
  if (path) {
    error = response.body.errors.find((error) =>
      (error.path || []).join('.') === path);
  } else {
    error = response.body.errors.find((error) =>
      error.path === undefined);
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
    assert.strictEqual(error!.message, messageTest);
  } else {
    assert(messageTest(error!.message), 'message did not match');
  }
};

export const assertSuccess = (response: GraphQlResponse) => {
  const status = response.statusCode;
  assert(status >= 200 && status < 300,
    `Did not succeed. HTTP status code was ${status}` +
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

export const setupGraphQL = (func: SetupGraphQL) => {
  setupGraphQLFunc = func;
};

export interface GraphQLTestContext {
  graphql: (query: string, variables?: Record<string, any>) => Test;
}

export interface GraphQlHooksOptions<Context extends GraphQLTestContext = GraphQLTestContext> {
  getApp: SetupContextGraphQl<Context>;
  context: Context;
  url?: string;
}

export function graphqlHooks <Context extends GraphQLTestContext = GraphQLTestContext>(
  {
    getApp,
    context,
    url = '/graphql'
  }: GraphQlHooksOptions<Context>
) {
  return {
    beforeEach() {
      const app = getApp(context);
      assert(app, 'GraphQL setup must return a Koa application');
      const request = supertest(app.callback());

      context.graphql = (query, variables) => {
        if (Array.isArray(query)) {
          return request.post(url)
            .send(query);
        }
        return request.post(url)
          .send({ query, variables });
      };
    }
  }
}


export interface GraphQlOptions {
  url?: string;
}

export const useGraphQL = (
  anyTest: TestInterface,
  {
    url = '/graphql'
  }: GraphQlOptions = {}
) => {
  const test = anyTest as TestInterface<GraphQLTestContext>;
  test.serial.beforeEach((t) => {
    const app = setupGraphQLFunc(t);
    assert(app, 'GraphQL setup must return a Koa application');
    const request = supertest(app.callback());

    t.context.graphql = (query, variables) => {
      if (Array.isArray(query)) {
        return request.post(url)
          .send(query);
      }
      return request.post(url)
        .send({ query, variables });
    };
  });
};
