const assert = require('assert');
const winston = require('winston');
const Grain = require('../core/Grain');
const GrainProxyFactory = require('../core/GrainProxyFactory');
const GrainFactory = require('../core/GrainFactory.js');
const SiloMasterRuntime = require('./SiloMasterRuntime');
const SiloWorkerRuntime = require('./SiloWorkerRuntime');
const cluster = require('cluster');

class Silo {
  constructor(config) {
    assert(config instanceof Object);
    assert(config.grains instanceof Object);

    this.config = config;
  }

  async start() {
    this.runtime = cluster.isMaster ? new SiloMasterRuntime(this.config) : new SiloWorkerRuntime(this.config);
    await this.runtime.start();
  }

  get isMaster() {
    return cluster.isMaster;
  }

  async getGrainActivation(grainReference, key) {
    return this.runtime.getGrainActivation(grainReference, key);
  }
}
module.exports = Silo;
