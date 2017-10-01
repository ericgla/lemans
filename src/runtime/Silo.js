const MasterRuntime = require('./MasterRuntime');
const WorkerRuntime = require('./WorkerRuntime');
const cluster = require('cluster');
const Config = require('../config/Config');
const { Logger, setLogger } = require('../core/Logger');

module.exports = class Silo {

  constructor(config) {
    this._config = Config.create(config);

    // if a logger is specified in the config, override the default logger
    if (config.logger) {
      setLogger(config.logger);
    }
    Logger.logLevel = config.logLevel;
  }

  async start() {
    if (cluster.isMaster) {
      this.runtime = new MasterRuntime(this);
    } else {
      this.runtime = new WorkerRuntime(this);
    }
    await this.runtime.start();
  }

  static get isMaster() {
    return cluster.isMaster;
  }

  static get isWorker() {
    return cluster.isWorker;
  }

  async stop() {
    await this.runtime.stop();
  }

};
