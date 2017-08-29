const {Grain} = require('../../../src');
const winston = require('winston');

class HelloGrain extends Grain {

  onActivate() {
    winston.info(`onActivate called from HelloGrain key ${this.key}`);
    super.onActivate();
  }

  onDeactivate() {
    winston.info(`onDeactivate called from HelloGrain key ${this.key}`);
    super.onDeactivate();
  }

  async sayHello(m, timeout) {
    this.deactivateOnIdle();
    return `sayHello ${m}`;
  }
}

module.exports = HelloGrain;