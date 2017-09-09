const uuidv4 = require('../util/uuid');

/**
 * base class for the master and worker runtime.  Handles all deferred promises
 */
class SiloRuntime {
  constructor() {
    this.deferred = new Map();
  }

  setDeferredPromise(resolve, reject, timeout, timeoutMessage) {
    const uuid = uuidv4();
    if (timeout) {
      const timeoutHandle = setTimeout(() => {
        reject(timeoutMessage);
        // prevent the response from sending a message back to the requester if we already timed out.
        this.deferred.delete(uuid);
        this.deferred.set(uuid, { resolve: () => {}, reject: () => {} });
      }, timeout);
      this.deferred.set(uuid, {resolve, reject, timeoutHandle });
    }
    else {
      this.deferred.set(uuid, {resolve, reject });
    }
    return uuid;
  }

  hasPromise(uuid) {
    return this.deferred.has(uuid);
  }

  getDeferredPromise(uuid) {
    if (!this.deferred.has(uuid)) {
      throw new Error(`cannot find promise for uuid ${uuid}`);
    }
    const p = this.deferred.get(uuid);
    if (p.timeoutHandle) {
      clearTimeout(p.timeoutHandle);
    }
    this.deferred.delete(uuid);
    return p;
  }

  getIdentityString(grainReference, key) {
    return `${grainReference}_${key}`;
  }
}
module.exports = SiloRuntime;