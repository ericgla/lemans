const {Grain} = require('../../../src');

class HelloGrain extends Grain {

  constructor(key) {
    super(key);
  }

  async sayHello(m, timeout) {
    const p = await new Promise(resolve => setTimeout(() => resolve(`sayHello ${m}`), timeout));
    return p;
  }

  async sayHello2(m, timeout) {
    throw new Error('test');
    return 'sayHello2';
  }
}

module.exports = HelloGrain;