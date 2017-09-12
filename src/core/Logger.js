const logLevel = {
  none: 1,
  error: 2,
  warn: 3,
  info: 4,
  debug: 5
};

let _logLevel = 'info';

class Logger {

  static set logLevel(level) {
    if (logLevel[level] === undefined) {
      console.log(`invalid log level ${level}. Using logLevel ${_logLevel}`);
    }
    _logLevel = logLevel[level];
  }

  static debug(msg) {
    if (_logLevel >= logLevel.debug) {
      console.log(`debug: ${msg}`);
    }
  }

  static info(msg) {
    if (_logLevel >= logLevel.info) {
      console.log(`info: ${msg}`);
    }
  }

  static warn(msg) {
    if (_logLevel >= logLevel.warn) {
      console.log(`warn: ${msg}`);
    }
  }

  static error(msg) {
    if (_logLevel >= logLevel.error) {
      console.error(`${msg}`);
    }
  }

}

let _logger = Logger;

const setLogger = (l) => {
  _logger = l;
}

module.exports = {
  Logger: _logger,
  setLogger
}