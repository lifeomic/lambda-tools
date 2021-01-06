# lambda-tools

[![npm](https://img.shields.io/npm/v/@lifeomic/lambda-tools.svg)](https://www.npmjs.com/package/@lifeomic/lambda-tools)
[![Build Status](https://travis-ci.org/lifeomic/lambda-tools.svg?branch=master)](https://travis-ci.org/lifeomic/lambda-tools)
[![Coverage Status](https://coveralls.io/repos/github/lifeomic/lambda-tools/badge.svg?branch=master)](https://coveralls.io/github/lifeomic/lambda-tools?branch=master)
[![Greenkeeper badge](https://badges.greenkeeper.io/lifeomic/lambda-tools.svg)](https://greenkeeper.io/)

`lambda-tools` provides a set of utilities that are useful for development and
testing of Lambda based services. The functionality is divided into several
main categories so that features may be adopted and used as needed. Working code
examples can be found in the [examples](./examples) directory.

```
npm install --save @lifeomic/lambda-tools
```

## DynamoDB

Many services use [DynamoDB][dynamodb] as their primary storage solution.
Testing service code against a DynamoDB storage layer requires either mocking
the DynamoDB interface (using something like [aws-sdk-mock][aws-sdk-mock]) or
pointing the test code at a provisioned DynamoDB instance. AWS has published
[DynamoDB Local][dynamodb-local] so that testing can be done without having to
use real AWS resources. DynamoDB Local has also been published as a
[community docker image][dynamodb-image] making testing even easier to do using
tools like [docker-compose][docker-compose] and [dockerode][dockerode].

`lambda-tools` supports both methods of integrating with DynamoDB. For simple
unit tests, the `dynamodb` helper can be used to provision and link DynamoDB
docker containers with [ava][ava] test suites. The helper will define all
relevant environment variables and will inject a preconfigured
[DyanomDB client][dynamodb-client] into the test context. The setup and tear
down will also create and destroy tables, as defined in the schema, between
test cases. The helper will also automatically handle port binding differences
between regular and nested Docker environments.

`lambda-tools` managed containers are able to join an existing docker-compose
network allowing them to reuse an existing DynamoDB container by simply setting
the appropriate environment variables. If the `dynamodb` helper sees the
`DYNAMODB_ENDPOINT` environment variable, it will not provision a new DynamoDB
container and will instead point all clients at and perform all table
manipulations in the referenced DynamoDB instance. In this case AWS specific
environment variables, like `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY`,
will also be used when constructing the test clients.

### `dynamodb.tableSchema(schema)`

Declares the table schema that should be used by all test cases using the
`useDynamoDB()` helper. A `schema` a list of parameter objects accepted by
[`AWS.DynamoDB.createTable()`][dynamodb-create-table].

### `dynamodb.useDynamoDB(test, useUniqueTables)`

Prepares an [ava][ava] test suite for use with DynamoDB. The test context will
include the following clients on the `dynamodb` attribute:

| Attribute        | Description/Type            |
|------------------|-----------------------------|
| documentClient   | AWS.DynamoDB.DocumentClient |
| dynamoClient     | AWS.DynamoDB                |
| streamsClient    | AWS.DynamoDBStreams         |
| tableNames       | Map of base table name to uuid table name. E.g. `users` to `users-abcdef12345`|
| uniqueIdentifier | The unique identifier appended to each table name. E.g. `abcdef12345`|
| config           | The aws dynamodb config object, useful for passing to dynamoose or other dynamo wrappers.|

If `useUniqueTables` is true, dynamically generated table names will be used, in
the form of `<tableNameProvidedInSchema>-<uuid>`. The unique table name can be
fetched from the `tableNames` map. Otherwise, the table name will be the default
provided in the schema. This allows tests to be run in parallel.


## Kinesis

Many services use [Kinesis][kinesis] as a message processing system.
Testing service code against a Kinesis service layer requires either mocking
the Kinesis interface (using something like [aws-sdk-mock][aws-sdk-mock]) or
pointing the test code at a provisioned Kinesis instance. LocalStack has published
[LocalStack Docker][localstack-docker] so that testing can be done without having to
use real AWS resources, making testing even easier to do using
tools like [docker-compose][docker-compose] and [dockerode][dockerode].

`kinesis-tools` supports both methods of integrating with Kinesis. For simple
unit tests, the `kinesis` helper can be used to provision and link a Kinesis
docker container with [ava][ava] test suites. The helper will define all
relevant environment variables and will inject a preconfigured
[Kinesis client][kinesis-client] into the test context. The setup and tear
down will also create and destroy streams, as defined in a provided stream name array, between
test cases. The helper will also automatically handle port binding differences
between regular and nested Docker environments.

`lambda-tools` managed containers are able to join an existing docker-compose
network allowing them to reuse an existing Kinesis instance by simply setting
the appropriate environment variables. If the `kinesis` helper sees the
`KINESIS_ENDPOINT` environment variable, it will not provision a new Kinesis
service and will instead point all clients at and perform all stream
manipulations in the referenced Kinesis instance. In this case AWS specific
environment variables, like `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY`,
will also be used when constructing the test clients.

### `kinesis.streams(streams)`

Declares the list of stream names that should be used by all test cases using the
`useKinesis()` helper.  Each stream will be created with one shard.

### `kinesis.useKinesis(test, streamName)`

Prepares an [ava][ava] test suite for use with a provided Kinesis instance. The test context will
include a AWS.Kinesis client on the `kinesis` attribute.

The streamName is used to create a new kinesis stream before all tests, and delete the stream at the end.
This method can be used to create multiple streams.

### `kinesis.useKinesisDocker(test, useUniqueStreams)`

Prepares an [ava][ava] test suite for use with Kinesis. The test context will
include the following clients on the `kinesis` attribute:

| Attribute        | Description/Type            |
|------------------|-----------------------------|
| kinesisClient    | AWS.Kinesis |
| streamNames      | Map of base stream name to uuid stream name. E.g. `users` to `users-abcdef12345`|
| uniqueIdentifier | The unique identifier appended to each stream name. E.g. `abcdef12345`|
| config           | The aws kinesis config object, useful for passing to AWS.Kineis, or other kinesis wrappers.|

If `useUniqueStreams` is true, dynamically generated stream names will be used, in
the form of `<streamNameProvided>-<uuid>`. The unique stream name can be
fetched from the `streamNames` map. Otherwise, the stream name will be the default
provided in the streams array. This allows tests to be run in parallel.

# Kinesis Tools

`kinesis.tools` contains some simple kinesis tools to iterate a stream.

## `KinesisIterator`

The `KinesisIterator` class provides a simple method to get the records from a stream by creating the stream iterator,
and reusing it to get records.

### Iterator `config`
| Attribute     | Description/Type |
|---------------|------------------|
| kinesisClient | AWS.Kinesis |
| streamName | the name of the kinesis stream |

### `new KinesisIterator(config)`

### `async init()`
The init function creates the stream iterator so it can get records from the stream.

### `async next(limit)`
Fetches the next batch of records from the stream.  It auto updates it's position in the stream, and returns the KinesisIterator

| Attribute     | Description/Type |
|---------------|------------------|
| limit | an optional limit to how many records to return.  Max is 10,000 |

### `records`
The records returned from the last `KinesisIterator.next()` call.

### `response`
The complete response from the last `KinesisIterator.next()` call.

### `static async newIterator(config)`
The static `KinesisIterator.newIterator` function creates a new `KinesisIterator`, and calls the init function.

## `async getStreamRecords(config)`
A convenience method to get a single batch of records from a stream.


## `createLambdaEvent(records)`
Convert an array of kinesis records into a lambda trigger event.


| Attribute      | Description/Type |
|----------------|------------------|
| SequenceNumber | number or string |
| PartitionKey   | The partition key of the record |
| SequenceNumber | number
| Data           | The data buffer returned by `kinesis.getRecords(...)` |

## `kinesisLambdaTrigger({lambdaHandler, kinesisIterator, limit})`
Will iterate through a kinesis stream, and pass the events to the lambdaHandler.


| Attribute       | Description/Type |
|-----------------|------------------|
| lambdaHandler   | A function to call the lambda function.  It will be called with { Records } |
| kinesisIterator | KinesisIterator that is already provisioned to iterate through all of the records |
| limit           | number. optional to limit how big each batch should be |


## GraphQL

`lambda-tools` provides helpers for wrapping [`Koa`][koa] instances in a client
that can easily make GraphQL requests. GraphQL reports application errors as
part of the response payload rather than through the use of HTTP status codes.
The `graphql` helpers provides specialized assertions that can be used to
check the status of a GraphQL response.

### `graphql.assertError(response, path, messageTest)`

Asserts that an error was returned on the response. `response` is the response
object returned from the helper client. `path` is an object path used to select
the error to test (GraphQL can return multiple errors for a single query).
`messageTest` is either a string or a function used to test the error message.
When a string is used the error message must be equal to the string. When a
function is used the function must return true if the message meets
expectations.

### `graphql.assertSuccess(response)`

Asserts that no errors are included on the response. `response` is the response
object returned from the helper client.

### `graphql.setupGraphQL(fn)`

Prepares a Koa app instance for use by the `useGraphQL()` helper. `fn` is
invoked with the `test` instance and must return a Koa application.

### `graphql.useGraphQL(test, options)`

Prepares an [ava][ava] test suite for use with theh GraphQL helper client. The
test context will be augmented with a `graphql(query, variables)` method that
will use [supertest][supertest] to POST data to the `options.url` endpoint and
return the response. The default endpoint is `/graphql`.

## MockServer Lambda

A collection of helper methods to mock and verify Lambda invocations based on [MockServer](https://mock-server.com/)


## Lambda

Replicating the Lambda runtime environment in a local test framework is a
non-trivial thing to do. `lambda-tools` provides helper functions that can
either provision managed containers on a developer's behalf or reuse containers
that have been provisioned externally (using something like
[docker-compose][docker-compose]). It is also possible to use a managed Lambda
container with other existing infrastructure managed by docker-compose.

### `lambda.useComposeContainer(options)`

Configures the `lambda` helper to use an existing container managed by
docker-compose in all test suites leveraging the `useLambda()` helper. This
helper depends on the `COMPOSE_PROJECT_NAME` environment variable being set in
the test process. The following options must be provided:

 - **handler** -- the reference to the Lambda handler function in the form
   `<module>.<function name>`
 - **service** -- the name of the compose service providing the Lambda runtime

### `lambda.useNewContainer(options)`

Configures the `lambda` helper to provision a new Docker container managed by
`lambda-tools` for use in test cases. The following options are supported:

 - **environment** -- a map of environment variables to be defined in the
   Lambda execution environment
 - **mountpoint** -- _required._ The directory that should be used as the
   Lambda task root. This should contain the Lambda code bundle.
 - **handler** - _required._ The reference to the Lambda handler function in
   the form `<module>.<function name>`
 - **image** - the docker image used to provide the Lambda runtime. By default
   `lambci/lambda:nodejs10.x` is used.
 - **useComposeNetwork** - a flag indicating if the container should be attached
   to a docker-compose managed network. By default the container uses a
   dedicated isolated network. If set to `true`, the `COMPOSE_PROJECT_NAME`
   environment variable must also be available in the test process.

### `lambda.useLambda(test, options)`

Prepares an [ava][ava] test suite for use with a Lambda runtime. `options` may
be used to provide or override any options from `useComposeContainer()` or
`useNewContainer()`. The test context will be augmented with a `lambda`
attribute. This attribute is an [alpha][alpha] client instance that will invoke
the configured Lambda function and has been augmented with two additional
methods. The `graphql(path, query, variables, config)` method will execute
a GraphQL query against the function where `path` is the URL path to POST to,
`query` and `variables` define the GraphQL request, and `config` provides any
additional `alpha` parameters (like request headers). The `raw(event, context)`
method allows a raw Lambda event to be passed to the function and will return
the raw response object.

### Lambda Webpack Bundle CLI

Building code bundles that are optimized for the Lambda runtime can be a
tedious exercise. In order to share code and learning in this area across
several projects, `lambda-tools` provides a `lambda-tools-build` command that
will generate Lambda code bundles. The CLI is capable of building a single
bundle or multiple bundles and includes source maps, transpiling, minification,
and relevant polyfills. When building a single bundle the output may also be
zipped so that it is ready for upload to the Lambda environment. The CLI
documentation may be accessed using the `lambda-tool-build --help` command.

**Build all lambda functions within a directory:**

```bash
lambda-tools-build -z -s my-service -n 8.10 -o ./dist/lambdas ./src/lambdas
```

Your `./src/lambdas` directory should look similar to:

- `./src/lambdas/func1/index.js`
- `./src/lambdas/func2/index.ts`
- `./src/lambdas/func3.js`
- `./src/lambdas/func4.ts`

This will produce the following zip files:

- `./dist/lambdas/func1.js.zip`
- `./dist/lambdas/func2.js.zip`
- `./dist/lambdas/func3.js.zip`
- `./dist/lambdas/func4.js.zip`

**Build a single lambda function and provide a name for the file:**

```bash
 lambda-tools-build -z -s my-service -n 8.10 -o ./dist/lambdas ./src/lambdas/my-function/index.ts:my-function.js
 ```

 This will produce the following zip files:

- `./dist/lambdas/my-function.js.zip`

You will also find the following intermediate files:

- `./dist/lambdas/my-function.js`
- `./dist/lambdas/my-function.js.map`

**Build a TypeScript lambda function with a custom tsconfig**

```bash
 lambda-tools-build -t tsconfig-prod.json -o ./dist src/service.ts
```

**Development mode:**

```bash
 WEBPACK_MODE=development lambda-tools-build -z -s my-service -n 8.10 -o ./dist/lambdas ./src/lambdas/my-function/index.ts:my-function.js
 ```

 The `WEBPACK_MODE=development` environment variable will prevent
 minification in the final output bundle.

## Debugging

To enable debug level logging we are using the [debug][debug] library to create the log lines.

Available flags are
- `lambda-tools:lambda`
- `lambda-tools:docker`
- `lambda-tools:localstack`
- `lambda-tools:webpack`

## Concurrency

If you are experiencing Docker networking errors, it might be because of the high level of concurrency
in the kinesis, docker, or localstack setup processes.  To specify how many connections to make at once
set the `LAMBDA_TOOLS_CONCURRENCY` environment variable to some integer value.


[alpha]: https://bitbucket.org/lifeomic/alpha/src/master/ "alpha"
[ava]: https://github.com/avajs/ava "Ava"
[aws-sdk-mock]: https://github.com/dwyl/aws-sdk-mock "aws-sdk-mock"
[debug]: https://github.com/visionmedia/debug "debug"
[docker-compose]: https://docs.docker.com/compose/ "Docker Compose"
[dockerode]: https://github.com/apocas/dockerode "Docker + Node = Dockerode"
[dynamodb]: https://aws.amazon.com/documentation/dynamodb/ "DynamoDB"
[dynamodb-client]: https://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/DynamoDB.html "DynamoDB Client"
[dynamodb-create-table]: https://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/DynamoDB.html#createTable-property "DynamoDB Client: Create Table"
[dynamodb-image]: https://hub.docker.com/r/cnadiminti/dynamodb-local/ "DynamoDB Docker Image"
[dynamodb-local]: https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/DynamoDBLocal.html "DynamoDB Local"
[koa]: http://koajs.com/ "koa"
[supertest]: https://github.com/visionmedia/supertest "supertest"
[kinesis]: https://aws.amazon.com/documentation/kinesis/ "Kinesis"
[kinesis-client]: https://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/Kinesis.html "Kinesis Client"
[localStack]: https://github.com/localstack/localstack "LocalStack"
[localStack-docker]: https://hub.docker.com/r/localstack/localstack/ "LocalStack Docker"
