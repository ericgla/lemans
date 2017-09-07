const uuidv4 = require('uuid/v4');

class SiloRuntime {
  constructor() {
    this.promises = new Map();
  }

  setDeferredPromise(resolve, reject) {
    const uuid = uuidv4();
    this.promises.set(uuid, { resolve, reject });
    return uuid;
  }

  hasPromise(uuid) {
    return this.promises.has(uuid);
  }

  getDeferredPromise(uuid) {
    if (!this.promises.has(uuid)) {
      throw new Error(`cannot find promise for uuid ${uuid}`);
    }
    const p = this.promises.get(uuid);
    this.promises.delete(uuid);
    return p;
  }

  getIdentityString(grainReference, key) {
    return `${grainReference}_${key}`;
  }
}
module.exports = SiloRuntime;