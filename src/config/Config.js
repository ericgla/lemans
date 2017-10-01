const defaults = require('./defaults');
const Grain = require('../core/Grain');
const StatefulGrain = require('../core/StatefulGrain');

module.exports = class Config {

  static create(config) {
    if (config) {
      Config.verifyConfig(config);
    }
    return Object.assign(defaults, config);
  }

  static verifyConfig(config) {

    Object.keys(config.grains).forEach((key) => {
      if (!(config.grains[key].prototype instanceof Grain)) {
        throw new Error(`${key} does not inherit from Grain`);
      }

      if (!(config.grains[key].prototype instanceof StatefulGrain) && !config.modules.storage) {
        throw new Error(`a storage module is required when inheriting from StatefulGrain. grain ${key}`);
      }
    });
  }

}
