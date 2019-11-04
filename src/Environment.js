class Environment {
  constructor () {
    this._backup = {};
  }

  restore () {
    for (const [ name, value ] of Object.entries(this._backup)) {
      if (value === undefined) {
        delete process.env[name];
      } else {
        process.env[name] = value;
      }
    }
  }

  set (name, value) {
    this._backup[name] = process.env[name];
    process.env[name] = value;
  }
}

module.exports = Environment;
