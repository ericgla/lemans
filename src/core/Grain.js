class Grain {
  constructor(key, identity, runtime) {
    this.key = key;
    this.identity = identity;
    this.runtime = runtime;
  }

  async onActivate() {
  }

  async onDeactivate() {
    this.runtime.deactivate(this.identity);
  }

  async deactivateOnIdle() {
    this.runtime.queueEndActivation(this.identity);
  }

  get GrainFactory() {
    return this.runtime._grainFactory;
  }
}

module.exports = Grain;
