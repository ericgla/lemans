const winston = require('winston');
const Grain = require('./Grain');

const createGrainProxy = (grainReference, grainClass, runtime) => {

  function GrainProxy(key, identity) {
    this._key = key;
    this._identity = identity;
    this._runtime = runtime;
    this._grainClass = grainClass;
  };

  /*
   * add the base class proxy methods first.  if the grain subclass has overridden any base methods,
   * the proxy methods will also be overridden
   */
  Object.getOwnPropertyNames(Grain.prototype).forEach((method) => {
    if (method !== 'constructor') {
      winston.debug(`pid ${process.pid} building worker proxy for grain ${grainReference} ${method}`);

      GrainProxy.prototype[method] = function (...args) {
        return this._runtime.invoke({
          grainReference,
          key: this._key,
          method,
          args
        });
      };
    }
  });

  Object.getOwnPropertyNames(grainClass.prototype).forEach((method) => {
    if (method !== 'constructor') {
      winston.debug(`pid ${process.pid} ${!GrainProxy.prototype[method] ? 'building' : 'overriding'} worker proxy for grain ${grainReference} ${method}`);

      GrainProxy.prototype[method] = function (...args) {
        return this._runtime.invoke({
          grainReference,
          key: this._key,
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

