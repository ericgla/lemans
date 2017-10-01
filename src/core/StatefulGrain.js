const Grain = require('./Grain');
const { Logger } = require('./Logger');

module.exports = class StatefulGrain extends Grain {

  constructor(key, identity, runtime) {
    super(key, identity, runtime);
    this._storage = runtime.modules.storage();
  }

  get state() {
    return this._state || {};
  }

  setState(state) {
    this._state = Object.assign({}, this._state, state);
  }

  async readState() {
    this._state = await this._storage.read(this._identity);
  }

  async writeState() {
    await this._storage.write(this._identity, this._state);
  }

  async clearState() {
    await this._storage.clear(this._identity);
  }

  async onActivate() {
    await this.readState();
  }

  async onDeactivate() {
    await this.writeState();
  }

}
