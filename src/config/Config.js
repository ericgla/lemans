const defaults = require('./defaults');
const Grain = require('../core/Grain');

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
    });
  }

}
