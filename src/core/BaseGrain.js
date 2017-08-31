/**
 *  base class for Grain.
 *  the grain proxies are generated from Grain and it's subclass, so any method that
 *  do not require a proxy method (methods that are private to the grain) go here.
 */
module.exports = class BaseGrain {
  constructor(key, identity, runtime) {
    this._key = key;
    this._identity = identity;
    this._runtime = runtime;
  }

  get key() { return this._key; }

  get identity() { return this._identity; }

  get GrainFactory() {
    return this.runtime._grainFactory;
  }

  async deactivateOnIdle() {
    this.runtime.queueEndActivation(this.identity);
  }

  getLogger() {}

  getStreamProvider() {}
}