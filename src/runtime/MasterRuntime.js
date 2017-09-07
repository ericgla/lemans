const GrainQueue = require('../core/GrainQueue');
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

module.exports = class MasterRuntime extends SiloRuntime {

  constructor(config) {
    super();
    this._config = config;
    this._grainQueueMap = new Map();
    this._grainFactory = new GrainFactory(this);
  }

  /*
   * public
   */
  async start() {
    return new Promise(async (resolve) => {
      this.numWorkers = this._config.maxWorkers;
      winston.info(`pid ${process.pid} starting silo master runtime with ${this.numWorkers} workers`);
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
          if (payload.msg === Messages.WORKER_READY) {
            winston.debug(`worker id ${worker.id} pid ${worker.process.pid} ready.`);
            worker.on('message', (p) => {
              this._processIncomingMessage(p, worker.process.pid);
            });
            onlineWorkers += 1;
            if (this.numWorkers === onlineWorkers) {
              winston.info(`pid ${process.pid} all ${onlineWorkers} workers ready.`);
              Object.keys(cluster.workers).forEach((key) => {
                cluster.workers[key].send({ msg: Messages.MASTER_READY });
              });
              resolve();
            }
          }
        });
      });
      cluster.on('disconnect', () => { winston.error('worker disconnect'); });
      cluster.on('exit', () => { winston.error('worker exit'); });
      cluster.on('error', () => { winston.error('worker error'); });
    });
  }

  get GrainFactory() {
    return this._grainFactory;
  }

  async invoke({ grainReference, key, method, args }) {
    const identity = this.getIdentityString(grainReference, key);

    return new Promise(async (resolve, reject) => {
      const uuid = this.setDeferredPromise(resolve, reject);
      const pid = this._grainQueueMap.get(identity).getPid();
      const workerIndex = getWorkerByPid(pid);
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

  /*
   * private
   */

  /**
   * gets the index of the worker to send the task to.
   * for now it's simply round robin, but should be expanded to take other metrics into account
   * such as # of activations on the worker, worker busy time, etc
   */
  _getNextWorkerIndex() {
    return Math.floor(Math.random() * (this.numWorkers - 1) + 1);
  }

  async _queueGetActivation(pid, identity, payload) {
    if (this._grainQueueMap.has(identity)) {
      // the grain is already active.  no need to queue since there is no actual work to do
      cluster.workers[getWorkerByPid(payload.fromPid)].send(Object.assign({}, payload, { msg: Messages.ACTIVATED }));
    } else {
      const workerIndex = this._getNextWorkerIndex();
      const grainQueue = new GrainQueue(identity, this, cluster.workers[workerIndex].process.pid);
      this._grainQueueMap.set(identity, grainQueue);
      grainQueue.add(async () => {
        return new Promise( (resolve, reject) => {
          const uuid = this.setDeferredPromise(() => {
            cluster.workers[getWorkerByPid(payload.fromPid)].send(Object.assign({}, payload, { msg: Messages.ACTIVATED}));
            resolve();
          }, (error) => {
            cluster.workers[getWorkerByPid(payload.fromPid)].send(Object.assign({}, payload, { msg: Messages.ACTIVATION_ERROR, error }));
            reject(error);
          });
          const msg = Object.assign({}, payload, { msg: Messages.CREATE_ACTIVATION, uuid });
          cluster.workers[workerIndex].send(msg);
        })
      }, 'activation');
    }
  }

  _queueInvoke(pid, identity, payload) {
    const grainQueue = this._grainQueueMap.get(identity);
    grainQueue.add(async () => {
      return new Promise( (resolve, reject) => {
        const uuid = this.setDeferredPromise((result) => {
          cluster.workers[getWorkerByPid(pid)].send(Object.assign({}, payload, { msg: Messages.INVOKE_RESULT, result }));
          resolve();
        }, (error) => {
          cluster.workers[getWorkerByPid(pid)].send(Object.assign({}, payload, { msg: Messages.INVOKE_ERROR, error }));
          reject(error);
        });
        const activationPid = this._grainQueueMap.get(identity).pid;
        cluster.workers[getWorkerByPid(activationPid)].send(Object.assign({}, payload, { uuid }));
      });
    }, `invoke ${payload.method}`);
    this._grainQueueMap.set(identity, grainQueue);
  }

  async _processIncomingMessage(payload, pid) {
    winston.debug(`master got msg from pid ${pid}: ${JSON.stringify(payload)}`);
    const identity = this.getIdentityString(payload.grainReference, payload.key);
    switch (payload.msg) {
      case Messages.GET_ACTIVATION:
        await this._queueGetActivation(pid, identity, Object.assign({}, payload));
        break;

      case Messages.CREATED:
        this._grainQueueMap.get(identity).pid = pid;
        this.getDeferredPromise(payload.uuid).resolve();
        break;

      case Messages.ACTIVATION_ERROR:
        this.getDeferredPromise(payload.uuid).reject(payload.error);
        break;

      case Messages.INVOKE:
        this._queueInvoke(pid, identity, payload);
        break;

      case Messages.INVOKE_RESULT:
        this.getDeferredPromise(payload.uuid).resolve(payload.result);
        break;

      case Messages.INVOKE_ERROR:
        this.getDeferredPromise(payload.uuid).reject(payload.error);
        break;

      case Messages.DEACTIVATED:
        this._grainQueueMap.delete(payload.identity);
        break;

      default:
        break;
    }
  }
}
