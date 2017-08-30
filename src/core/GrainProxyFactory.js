const winston = require('winston');
const Queue = require('./Queue');
const Grain = require('./Grain');

const buildRemoteGrainProxy = (grainReference, grainClass, runtime) => {

  function GrainProxy(key, identity, pid) {
    this._location = 'remote';
    this._key = key;
    this._identity = identity;
    this._runtime = runtime;
    this._pid = pid;
  };

  GrainProxy.prototype.getPid = function() {
    return this._pid;
  };

  GrainProxy.prototype.getLocation = function() {
    return this._location;
  };

  Object.getOwnPropertyNames(grainClass.prototype).forEach((method) => {
    if (method !== 'constructor') {
      winston.debug(`pid ${process.pid} building remote proxy for grain ${grainReference} method ${method}`);

      GrainProxy.prototype[method] = async function (...args) {
        // forward the call to the worker containing the activation,
        // return a promise to the caller
        return this._runtime.invoke({
          grainReference,
          key: this._key,
          pid: this._pid,
          method,
          args
        });
      };
    }
  });
  return GrainProxy;
}

const buildLocalGrainProxy = (grainReference, GrainClass, runtime) => {

  function GrainProxy(key, identity) {
    this._location = 'local';
    this._key = key;
    this._identity = identity;
    this._runtime = runtime;
    this._grain = new GrainClass(key, identity, runtime);
    this._methodQueue = new Queue();
    this._processing = false;

    this.enqueueGrainMethod = async (method, args) => {
      winston.debug(`pid ${process.pid} enqueue method ${method} for identity ${this._identity}`);
      return new Promise((resolve, reject) => {
        // queue the grain call for later execution
        this._methodQueue.enqueue(
          async () => {
            try {
              const result = await this._grain[method](...args);
              resolve(result);
            } catch (err) {
              // forward the error to the caller
              reject(err);
            }
          }
        );
        if (!this._processing) {
          // start processing any queued grain calls
          this._processing = true;
          setTimeout(this.processQueueItem, 1);
        }
      });
    };

    GrainProxy.prototype.getLocation = function() {
      return this._location;
    };

    this.processQueueItem = async () => {
      if (this._methodQueue.size > 0) {
        const fn = this._methodQueue.dequeue();
        winston.debug(`pid ${process.pid} dequeue method for identity ${this._identity}`);
        await fn();
        await this.processQueueItem();
      } else {
        this._processing = false;
      }
    };
  }

  /*
   * add the base class proxy methods first.  if the grain subclass has overridden any base methods,
   * the proxy methods will also be overridden
   */
  Object.getOwnPropertyNames(Grain.prototype).forEach((method) => {
    if (method !== 'constructor') {
      winston.debug(`pid ${process.pid} building local proxy for grain ${grainReference} ${method}`);

      GrainProxy.prototype[method] = function (...args) {
        // the call to the grain method is will be queued for later execution,
        return this.enqueueGrainMethod(method, args);
      };
    }
  });

  Object.getOwnPropertyNames(GrainClass.prototype).forEach((method) => {
    if (method !== 'constructor') {
      winston.debug(`pid ${process.pid} ${GrainProxy.prototype[method] === undefined ? 'building' : 'overriding'} local proxy for grain ${grainReference} ${method}`);

      GrainProxy.prototype[method] = function (...args) {
        // the call to the grain method is will be queued for later execution,
        return this.enqueueGrainMethod(method, args);
      };
    }
  });
  return GrainProxy;
};

module.exports.createLocal = (grains, runtime) => {
  const proxies = [];

  Object.entries(grains).forEach(([grainReference, grain]) => {
    if (grain.prototype instanceof Grain) {
      proxies[grainReference] = buildLocalGrainProxy(grainReference, grain, runtime);
    } else {
      throw new Error(`grain reference ${grainReference} does not inherit from Grain`);
    }
  });
  return proxies;
};

module.exports.createRemote = (grains, runtime) => {
  const proxies = [];

  Object.entries(grains).forEach(([grainReference, grain]) => {
    if (grain.prototype instanceof Grain) {
      proxies[grainReference] = buildRemoteGrainProxy(grainReference, grain, runtime);
    } else {
      throw new Error(`grain reference ${grainReference} does not inherit from Grain`);
    }
  });
  return proxies;
};
