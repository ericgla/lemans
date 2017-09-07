const assert = require('assert');
const winston = require('winston');
const MasterRuntime = require('./MasterRuntime');
const WorkerRuntime = require('./WorkerRuntime');
const Storage = require('../providers/Storage');
const Stream = require('../providers/Stream');
const cluster = require('cluster');

module.exports = class Silo {

  constructor(config) {
    assert(config instanceof Object);
    assert(config.grains instanceof Object);
    winston.level = config.logLevel;

    this._config = config;
    this._modules = [];
  }

  use(module) {
    if (module instanceof Storage) {
      this._modules.push(module);
    } else if (module instanceof Stream) {
      this._modules.push(module);
    } else {
      winston.warn(`unknown module type ${module.name}`);
    }
  }

  async start() {
    if (cluster.isMaster) {
      this.runtime = new MasterRuntime(this._config, this._modules);
    } else {
      this.runtime = new WorkerRuntime(this._config, this._modules);
    }
    await this.runtime.start();
  }

  get isMaster() {
    return cluster.isMaster;
  }
}
