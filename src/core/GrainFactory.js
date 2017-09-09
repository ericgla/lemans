const MasterRuntime = require('../runtime/MasterRuntime');

let _runtime;

/**
 * Static class that provides grain access to a worker process
 */
module.exports = class GrainFactory {

  constructor(runtime) {
    _runtime = runtime;
  }

  static async getGrain(grainReference, key) {
    if (_runtime instanceof MasterRuntime) {
      throw new Error('access to grain proxies can only be made on workers.  Use silo.isWorker to check if you are on a worker.');
    }
    return _runtime.getGrainProxy(grainReference, key);
  }
}
