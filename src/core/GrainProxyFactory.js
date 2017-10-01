const Grain = require('./Grain');
const { Logger } = require('./Logger');
/**
 *  Builds proxy classes for all grain types at silo startup.  These generated proxy classes will be instantiated
 *  by the worker runtime to call methods on a grain instance.  Note that the actual grain instance may live on a different
 *  worker process, and all calls to the grain instance are sequenced by the master runtime.
 */
const createGrainProxy = (grainReference, grainClass, runtime) => {

  class GrainProxy {

    constructor(key, identity) {
      this._key = key;
      this._identity = identity;
      this._runtime = runtime;
      this._grainClass = grainClass;
    }

    get GrainClass() {
      return this._grainClass;
    }

  }

  /**
   * add the base class proxy methods first.  if the grain subclass has overridden any base methods,
   * the proxy methods will also be overridden
   */
  Object.getOwnPropertyNames(Grain.prototype).forEach((method) => {
    if (method !== 'constructor') {
      Logger.debug(`pid ${process.pid} building worker proxy for grain base ${grainReference} ${method}`);

      GrainProxy.prototype[method] = function (...args) {
        return this._runtime.invoke({
          identity: this._identity,
          method,
          args
        });
      };
    }
  });

  Object.getOwnPropertyNames(grainClass.prototype).forEach((method) => {
    if (method !== 'constructor') {
      Logger.debug(`pid ${process.pid} building worker proxy for grain ${grainReference} ${method}`);

      GrainProxy.prototype[method] = function (...args) {
        return this._runtime.invoke({
          identity: this._identity,
          method,
          args
        });
      };
    }
  });

  return GrainProxy;
}

module.exports.create = (grains, runtime) => {
  const proxies = [];

  Object.entries(grains).forEach(([grainReference, grain]) => {
    if (grain.prototype instanceof Grain) {
      proxies[grainReference] = createGrainProxy(grainReference, grain, runtime);
    } else {
      throw new Error(`grain reference ${grainReference} does not inherit from Grain`);
    }
  });
  return proxies;
};
