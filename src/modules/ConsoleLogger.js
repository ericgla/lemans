const logLevel = {
  none: 1,
  error: 2,
  warn: 3,
  info: 4,
  debug: 5
};

module.exports = class {

  constructor(level) {
    if (level) {
      this.logLevel = level;
    } else {
      this._logLevel = logLevel.info;
    }
  }

  set logLevel(level) {
    if (logLevel[level] === undefined) {
      console.log(`invalid log level ${level}. Using logLevel ${this._logLevel}`);
    }
    this._logLevel = logLevel[level];
  }

  debug(msg) {
    if (this._logLevel >= logLevel.debug) {
      console.log(`debug: ${msg}`);
    }
  }

  info(msg) {
    if (this._logLevel >= logLevel.info) {
      console.log(`info: ${msg}`);
    }
  }

  warn(msg) {
    if (this._logLevel >= logLevel.warn) {
      console.log(`warn: ${msg}`);
    }
  }

  error(msg) {
    if (this._logLevel >= logLevel.error) {
      console.error(`${msg}`);
    }
  }

}