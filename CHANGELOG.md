# Changelog
All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
