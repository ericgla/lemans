const {Grain} = require('../../../src');
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
    return `HelloGrain pid ${process.pid} key ${this.key} count ${this.count} ${m}`;
  }
}

module.exports = HelloGrain;