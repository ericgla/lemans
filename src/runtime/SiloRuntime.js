const cluster = require('cluster');
const uuidv4 = require('uuid/v4');

class SiloRuntime {
  constructor() {
    this.promises = [];
  }

  addPromise(resolve, reject) {
    const uuid = uuidv4();
    this.promises[uuid] = { resolve, reject };
    return uuid;
  }

  getPromise(uuid) {
    if (this.promises[uuid] === undefined) {
      throw new Error(`cannot find promise for uuid ${uuid}`);
    }
    return this.promises[uuid];
  }

  getIdentityString(grainReference, key) {
    return `${grainReference}_${key}`;
  }
}
module.exports = SiloRuntime;