let _runtime;

class GrainFactory {
  constructor(runtime) {
    _runtime = runtime;
  }

  static async getGrain(grainReference, key) {
    return _runtime.getGrainActivation(grainReference, key);
  }
}

module.exports = GrainFactory;