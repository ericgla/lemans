const Grain = require('../../../src/core/Grain');

module.exports = class EchoGrain extends Grain {

  async onActivate() {
    this.count = 0;
    await super.onActivate();
  }

  async onDeactivate() {
    await super.onDeactivate();
  }

  async echo(message) {
    this.count += 1;
    return `EchoGrain key ${this.key} running on pid ${process.pid} count ${this.count} echo ${message}`;
  }
}
