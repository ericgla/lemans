const winston = require('winston');
const MasterRuntime = require('./MasterRuntime');
const WorkerRuntime = require('./WorkerRuntime');
const Storage = require('../providers/Storage');
const Stream = require('../providers/Stream');
const cluster = require('cluster');
const Config = require('../config/Config');

module.exports = class Silo {

  constructor(config) {
    this._config = Config.create(config);
    winston.level = this._config.logLevel;
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

  get isWorker() {
    return cluster.isWorker;
  }

}
