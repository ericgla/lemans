const winston = require('winston');
const Queue = require('./Queue');
const Grain = require('./Grain');
const cluster = require('cluster');

const buildForwardingGrainProxy = (grainReference, grainClass, runtime) => {
  winston.debug(`creating forwarding proxy for grain ${grainReference}`);

  function GrainProxy(key) {
    this.key = key;
    this.runtime = runtime;
  }

  Object.getOwnPropertyNames(grainClass.prototype).forEach((method) => {
    if (method !== 'constructor') {
      winston.debug(`creating proxy for method ${method}`);

      GrainProxy.prototype[method] = async function (...args) {
        // forward the call to the worker containing the activation,
        // return a promise to the caller
        return this.runtime.invoke({
          grainReference,
          key: this.key,
          pid: this.pid,
          method,
          args
        });
      };
    }
  });
  return GrainProxy;
}

const buildWorkerGrainProxy = (grainReference, GrainClass, runtime) => {
  winston.debug(`creating worker proxy for grain ${grainReference}`);

  function GrainProxy(key) {
    this.key = key;
    this.runtime = runtime;
    this.grain = new GrainClass(key);
    this.methodQueue = new Queue();
    this.processing = false;
    this.processQueueItem = async () => {
      if (this.methodQueue.size > 0) {
        winston.debug(`dequeue key ${key} size ${this.methodQueue.size}`);
        const fn = this.methodQueue.dequeue();
        await fn();
        await this.processQueueItem();
      } else {
        this.processing = false;
      }
    };
  }

  Object.getOwnPropertyNames(GrainClass.prototype).forEach((method) => {
    if (method !== 'constructor') {
      winston.debug(`creating proxy for method ${method}`);

      GrainProxy.prototype[method] = function (...args) {
        // the call to the grain method is will be queued for later execution,
        // return a promise to the caller
        return new Promise((resolve, reject) => {
          // queue the grain call for later execution
          this.methodQueue.enqueue(
            async () => {
              try {
                const result = await this.grain[method](...args);
                resolve(result);
              } catch (err) {
                // forward the error to the caller
                reject(err);
              }
            }
          );
          if (!this.processing) {
            // start processing any queued grain calls
            this.processing = true;
            setTimeout(this.processQueueItem, 1);
          }
        });
      };
    }
  });
  return GrainProxy;
};

const buildGrainProxies = (grains, runtime) => {
  const proxies = [];

  Object.entries(grains).forEach(([grainReference, grain]) => {
    if (grain.prototype instanceof Grain) {
      if (cluster.isMaster) {
        proxies[grainReference] = buildForwardingGrainProxy(grainReference, grain, runtime);
      } else {
        proxies[grainReference] = buildWorkerGrainProxy(grainReference, grain, runtime);
      }
    } else {
      throw new Error(`grain reference ${grainReference} does not inherit from Grain`);
    }
  });
  return proxies;
};

module.exports = {
  create: buildGrainProxies
};