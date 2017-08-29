const {Grain} = require('../../../src');

class TestGrain extends Grain {

  echo(message) {
    return Promise.resolve(`pid ${process.pid}`);
  }
}

module.exports = TestGrain;