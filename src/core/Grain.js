const BaseGrain = require('./BaseGrain');

/*
 * base class for user created grains.  Proxy methods will be created for all
 * methods on Grain and it's subclass
 */
class Grain extends BaseGrain {

  async onActivate() {}

  async onDeactivate() {
    this.runtime.deactivate(this.identity);
  }

}

module.exports = Grain;
