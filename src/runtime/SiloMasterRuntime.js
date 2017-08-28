const GrainProxyFactory = require('../core/GrainProxyFactory');
const GrainFactory = require('../core/GrainFactory.js');
const cluster = require('cluster');
const os = require('os');
const uuidv4 = require('uuid/v4');
const SiloRuntime = require('./SiloRuntime');
const Messages = require('./Messages');

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
    super();
    this.config = config;
    this.grainProxies = GrainProxyFactory.create(config.grains, this);
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

      cluster.on('online', (worker) => {
        console.log(`-ONLINE ${worker.id} pid ${worker.process.pid}-`);
        worker.on('message', (payload) => {
          // the worker isn't ready to process messages until the worker runtime's constructor is called
          // not sure if we really need to do this, or there is a different worker message to listen for
          if (payload.msg === 'ready') {
            console.log(`-READY ${worker.id} pid ${worker.process.pid}-`);
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

  getWorkerIndex() {
    const index = this.nextWorkerIndex;
    this.nextWorkerIndex += 1;
    if (this.nextWorkerIndex > this.numWorkers) {
      this.nextWorkerIndex = 1;
    }
    return index;
  }

  async processIncomingMessage(payload, pid) {
    console.log(`master got msg from pid ${pid}: ${payload.uuid} ${payload.msg} ${payload.grainReference} ${payload.key}`);
    const identity = this.getIdentityString(payload.grainReference, payload.key);
    switch (payload.msg) {
      case Messages.GET_ACTIVATION: {
        // a worker is requesting a grain activation.
        // TODO
        // if there is an activation, return the pid containing the activation to the worker,
        // and the worker will directly message the worker with the activation
        // if no activation exists, create it and send the pid
        break;
      }
      case Messages.ACTIVATED: {
        // the grain was activated on the worker.  update the activation map with the pid of the worker
        this.grainActivations[identity] = {
          activation: new this.grainProxies[payload.grainReference](payload.key),
          pid: payload.pid
        };
        // resolve the pending promise for this message uuid
        // TODO check that pid exists and throw exception
        this.promises[payload.uuid].resolve(this.grainActivations[identity].activation);
        break;
      }
      case Messages.ACTIVATION_ERROR: {
        // reject the pending promise for this message uuid
        this.promises[payload.uuid].reject(payload.error);
        break;
      }
      case Messages.INVOKE_RESULT: {
        // resolve the pending promise for this message uuid
        // TODO check that pid exists and throw exception
        this.promises[payload.uuid].resolve(payload.result);
        break;
      }
      default:
        break;
    }
  }

  /*
   * returns a grain proxy object for the given grain reference and key
   * the
   */
  async getGrainActivation(grainReference, key) {
    const identity = `${grainReference}_${key}`;
    // the master runtime never contains any activations, only workers
    if (this.grainActivations[identity] === undefined) {
      // there is no activation for this identity, tell a worker to create it.
      const uuid = uuidv4();
      return new Promise((resolve, reject) => {
        this.promises[uuid] = { resolve, reject };
        console.log('master sending message getActivation');
        cluster.workers[this.getWorkerIndex()].send({
          msg: Messages.GET_ACTIVATION,
          grainReference,
          key,
          uuid
        });
      });
    }
    return Promise.resolve(this.grainActivations[identity].activation);
  }

  async invoke({ grainReference, key, method, args }) {
    const identity = `${grainReference}_${key}`;
    const uuid = uuidv4();
    return new Promise(async (resolve, reject) => {
      this.promises[uuid] = { resolve, reject };
      const pid = this.grainActivations[identity].pid;
      const workerIndex = getWorkerByPid(pid);
      console.log(`master sending message invoke to pid ${pid}`);
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
