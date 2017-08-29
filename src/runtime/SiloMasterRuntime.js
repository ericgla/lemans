const GrainProxyFactory = require('../core/GrainProxyFactory');
const GrainFactory = require('../core/GrainFactory.js');
const cluster = require('cluster');
const os = require('os');

const SiloRuntime = require('./SiloRuntime');
const Messages = require('./Messages');
const winston = require('winston');

const getWorkerByPid = (pid) => {
  let index;
  Object.keys(cluster.workers).forEach((key) => {
    if (cluster.workers[key].process.pid === pid) {
      index = key;
    }
  });
  return index;
}

class SiloMasterRuntime extends SiloRuntime {
  constructor(config) {
    winston.info(`initializing master runtime pid ${process.pid}`);
    super();
    this.config = config;
    this.grainProxies = {
      local: GrainProxyFactory.createLocal(config.grains, this),
      remote: GrainProxyFactory.createRemote(config.grains, this)
    };
    this.grainActivations = [];
    this.grainFactory = new GrainFactory(this);
    this.nextWorkerIndex = 1;
    this.promises = [];
  }

  async start() {
    return new Promise((resolve) => {
      this.numWorkers = this.config.maxWorkers || os.cpus().length;
      let onlineWorkers = 0;

      for (let i = 0; i < this.numWorkers; i++) {
        cluster.fork();
      }

      /*
       * wait for each worker to come online and send a ready message
       */
      cluster.on('online', (worker) => {
        worker.on('message', (payload) => {
          // the worker isn't ready to process messages until the worker runtime's constructor is called
          // not sure if we really need to do this, or there is a different worker message to listen for
          if (payload.msg === 'ready') {
            winston.info(`worker id ${worker.id} ready. pid ${worker.process.pid}`);
            onlineWorkers += 1;
            if (this.numWorkers === onlineWorkers) {
              Object.keys(cluster.workers).forEach((key) => {
                cluster.workers[key].on('message', (p) => {
                  this.processIncomingMessage(p, cluster.workers[key].process.pid);
                });
              })
              resolve();
            }
          }
        });
      });
    });
  }

  get GrainFactory() {
    return this.grainFactory;
  }

  /**
   * gets the index of the worker to send the task to.
   * for now it's simply round robin, but should be expanded to take other metrics into account
   * such as # of activations on the worker, worker busy time, etc
   */
  getWorkerIndex() {
    const index = this.nextWorkerIndex;
    this.nextWorkerIndex += 1;
    if (this.nextWorkerIndex > this.numWorkers) {
      this.nextWorkerIndex = 1;
    }
    return index;
  }

  async processIncomingMessage(payload, pid) {
    winston.info(`master got msg from pid ${pid}: ${JSON.stringify(payload)}`);
    const identity = this.getIdentityString(payload.grainReference, payload.key);
    switch (payload.msg) {
      case Messages.GET_ACTIVATION: {
        // a worker is requesting a grain activation.
        try {
          const activation = await this.getGrainActivation(payload.grainReference, payload.key);
          cluster.workers[getWorkerByPid(payload.pid)].send({
            msg: Messages.ACTIVATED,
            uuid: payload.uuid,
            pid: process.pid,
            activationPid: activation.pid,
            grainReference: payload.grainReference,
            key: payload.key
          });
        } catch (e) {
          cluster.workers[getWorkerByPid(payload.pid)].send({
            msg: Messages.ACTIVATION_ERROR,
            uuid: payload.uuid,
            pid: process.pid,
            grainReference: payload.grainReference,
            key: payload.key,
            error: payload.error
          });
        }
        break;
      }
      case Messages.INVOKE: {
        try {
          const result = await this.invoke(payload);
          cluster.workers[getWorkerByPid(payload.pid)].send({
            msg: Messages.INVOKE_RESULT,
            uuid: payload.uuid,
            pid: process.pid,
            grainReference: payload.grainReference,
            key: payload.key,
            result
          });
        } catch (e) {
          cluster.workers[getWorkerByPid(payload.pid)].send({
            msg: Messages.INVOKE_ERROR,
            uuid: payload.uuid,
            pid: process.pid,
            grainReference: payload.grainReference,
            key: payload.key,
            error: payload.error
          });
        }
        break;
      }
      case Messages.ACTIVATED: {
        // the grain was activated on the worker.  update the activation map with the pid of the worker
        this.grainActivations[identity] = new this.grainProxies.remote[payload.grainReference](payload.key, identity, payload.pid);
        // resolve the pending promise for this message uuid
        this.getPromise(payload.uuid).resolve(this.grainActivations[identity]);
        break;
      }
      case Messages.ACTIVATION_ERROR: {
        // reject the pending promise for this message uuid
        this.getPromise(payload.uuid).reject(payload.error);
        break;
      }
      case Messages.INVOKE_RESULT: {
        // resolve the pending promise for this message uuid
        this.getPromise(payload.uuid).resolve(payload.result);
        break;
      }
      case Messages.DEACTIVATED: {
        this.grainActivations[payload.identity] = undefined;
        break;
      }
      default:
        break;
    }
  }
  /*
   * returns a grain proxy object for the given grain reference and key
   */
  async getGrainActivation(grainReference, key) {
    const identity = `${grainReference}_${key}`;
    // the master runtime never contains any activations, only workers
    if (this.grainActivations[identity] === undefined) {
      // there is no activation for this identity, tell a worker to create it.
      return new Promise((resolve, reject) => {
        const uuid = this.addPromise(resolve, reject);
        winston.info('master sending message getActivation');
        cluster.workers[this.getWorkerIndex()].send({
          msg: Messages.GET_ACTIVATION,
          grainReference,
          key,
          uuid
        });
      });
    }
    return Promise.resolve(this.grainActivations[identity]);
  }

  async invoke({ grainReference, key, method, args }) {
    const identity = this.getIdentityString(grainReference, key);

    return new Promise(async (resolve, reject) => {
      const uuid = this.addPromise(resolve, reject);
      const pid = this.grainActivations[identity].pid;
      const workerIndex = getWorkerByPid(pid);
      winston.info(`master sending message invoke method ${method} to pid ${pid}`);
      cluster.workers[workerIndex].send({
        msg: Messages.INVOKE,
        grainReference,
        key,
        uuid,
        method,
        args
      });
    });
  }
}

module.exports = SiloMasterRuntime;
