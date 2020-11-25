export class Environment {
  private _backup: Record<string, any> = {}

  restore () {
    for (const [ name, value ] of Object.entries(this._backup)) {
      if (value === undefined) {
        delete process.env[name];
      } else {
        process.env[name] = value;
      }
    }
  }

  set (name: string, value: any) {
    this._backup[name] = process.env[name];
    process.env[name] = value;
  }
}

export default Environment;
