# Changelog
All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [14.1.0] - 2021-01-11
### Allow specifying the dynamodb docker image
- DynamoDB Input option to specify the docker dynamodb image and version

## [14.0.0] - 2021-01-07
### Webpack and node version updates
- Removed async to generator for babel.
- Defaulted to version 0.12.4 localstack
- Removed old node versions from tests

## [13.0.0] - 2020-12-07
### Typescript conversions
- Updated the rest of the source files to typescript.  This will break some commonJS
imports if they are importing `src/WriteBuffer` or `src/Environment`.

## [12.0.0] - 2020-11-23
### Type Breaking
- Converted localstack to typescript, and fixed some inputs
- Updated deployment to use `github-actions`

## [11.2.2] - 2020-07-31
### Fixed
- Add explicit peerDependency entry for `@lifeomic/alpha`. Previously, alpha
was being used, but not declared as a dependency.

## [11.0.3] - 2020-02-28
### Fixed
- Adding missing properties to WebpackOptions TS typing

## [10.0.0] - 2020-01-10
### Breaking
- Remove support for the ENABLE_LAMBDA_LOGGING environment variable. Instead you can set DEBUG=lambda-tools:lambda

## [8.0.0] - 2019-06-07
### Breaking
- Upgraded ava to 2.0
- Drop support for node 6

## [7.2.0] - 2019-02-27
### New
- A new `-t` options for the webpack build CLI that allows providing a
  `tsconfig.json` file for TypeScript compilation

## [7.1.0] - 2019-02-27
### New
- A new `mountpointParent` option on `useNewContainer` to was added to control
  where `zipfile` arguments are unzippped. This new option can be used when
  trying to align paths both inside and outside docker which is needed when
  using `zipfile` from inside a compose environment.

## [7.0.0] - 2019-02-26
### New
- A new `zipfile` option on `useNewContainer` to build containers straight from
  zip files. Testing from zip files can help validate final packaging.

### Breaking
- Dependent projects will need to make sure that MockServer 5.5 is used in
  docker-compose environments and npm dependencies
- Dependnet projects need to upgrade to Ava 1.x


[11.2.2]: https://github.com/lifeomic/lambda-tools/compare/v11.2.1...v11.2.2
[11.0.3]: https://github.com/lifeomic/lambda-tools/compare/v10.0.0...v11.0.3
[10.0.0]: https://github.com/lifeomic/lambda-tools/compare/v8.0.0...v10.0.0
[8.0.0]: https://github.com/lifeomic/lambda-tools/compare/v7.2.0...v8.0.0
[7.2.0]: https://github.com/lifeomic/lambda-tools/compare/v7.1.0...v7.2.0
[7.1.0]: https://github.com/lifeomic/lambda-tools/compare/v7.0.0...v7.1.0
[7.0.0]: https://github.com/lifeomic/lambda-tools/compare/v6.0.1...v7.0.0
