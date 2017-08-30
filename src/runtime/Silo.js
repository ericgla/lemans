const assert = require('assert');
const winston = require('winston');
const SiloMasterRuntime = require('./SiloMasterRuntime');
const SiloWorkerRuntime = require('./SiloWorkerRuntime');
const cluster = require('cluster');

module.exports = class Silo {
  constructor(config) {
    assert(config instanceof Object);
    assert(config.grains instanceof Object);
    winston.level = config.logLevel;

    this._config = config;
  }

  async start() {
    this.runtime = cluster.isMaster ? new SiloMasterRuntime(this._config) : new SiloWorkerRuntime(this._config);
    await this.runtime.start();
  }

  get isMaster() {
    return cluster.isMaster;
  }
}
