class Environment {
  constructor () {
    this._backup = {};
  }

  restore () {
    for (const [ name, value ] of Object.entries(this._backup)) {
      if (value === undefined) {
        // eslint-disable-next-line security/detect-object-injection
        delete process.env[name];
      } else {
        // eslint-disable-next-line security/detect-object-injection
        process.env[name] = value;
      }
    }
  }

  set (name, value) {
    // eslint-disable-next-line security/detect-object-injection
    this._backup[name] = process.env[name];
    // eslint-disable-next-line security/detect-object-injection
    process.env[name] = value;
  }
}

module.exports = Environment;
