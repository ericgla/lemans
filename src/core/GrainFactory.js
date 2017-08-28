let _silo = null;

class GrainFactory {
  constructor(silo) {
    _silo = silo;
  }

  static async getGrain(grainReference, key) {
    return _silo.getGrainActivation(grainReference, key);
  }
}

module.exports = GrainFactory;