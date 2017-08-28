const {Grain} = require('../../../src');

class TestGrain extends Grain {

  testMessage(message) {
    return Promise.resolve("hello from the test grain " + message + p2 + p3);
  }

  foo(a, b, c) {
    return null;
  }
}

module.exports = TestGrain;