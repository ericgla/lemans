const BaseGrain = require('./BaseGrain');

/**
 * base class for user created grains.  Proxy methods will be created for all
 * methods on Grain and it's subclass
 */
module.exports = class Grain extends BaseGrain {

  async onActivate() {}

  async onDeactivate() {}

  async readState() {}

  async writeState() {}

  async clearState() {}

}

