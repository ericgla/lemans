const Grain = require('../../../src/core/Grain');
const winston = require('winston');

class HelloGrain extends Grain {

  onActivate() {
    winston.info(`onActivate called from HelloGrain key ${this.key}`);
    super.onActivate();
    this.count = 0;
  }

  onDeactivate() {
    winston.info(`onDeactivate called from HelloGrain key ${this.key}`);
    super.onDeactivate();
  }

  async echo(m) {
    this.count += 1;
    winston.info(`HelloGrain running on pid ${process.pid} key ${this.key} count ${this.count}`);
    return `HelloGrain: ${m}`;
  }
}

module.exports = HelloGrain;