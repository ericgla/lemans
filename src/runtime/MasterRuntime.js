const { GrainActivation } = require('../core/GrainActivation');
const cluster = require('cluster');
const SiloRuntime = require('./SiloRuntime');
const Messages = require('./Messages');
const winston = require('winston');
const WorkerManager = require('./WorkerManager');

module.exports = class MasterRuntime extends SiloRuntime {

  constructor(config) {
    super();
    this._config = config;
    this._grainActivationMap = new Map();
    this._workerManager = new WorkerManager(this);
    process.on('unhandledRejection', (reason, p) => {
      winston.error('Unhandled Rejection in master runtime at: Promise', p, 'reason:', reason);
    });
    this._deactivationHandle = setInterval(() => {
      const now = new Date();
      this._grainActivationMap.forEach((activation, identity) => {
        if ((now - activation.lastActivityDate) / 1000 > this._config.grainDeactivateOnIdle) {
          winston.info(`idle deactivating ${identity}`);
          this._deactivate(identity);
          this._grainActivationMap.delete(identity);
        }
      });
    }, 1 * 1000);
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

  async stop() {
    winston.info(`pid ${process.pid} stopping silo master runtime`);
    clearInterval(this._deactivationHandle);
    this._grainActivationMap.forEach((activation, identity) => {
      winston.info(`idle deactivating ${identity}`);
      this._deactivate(identity);
      this._grainActivationMap.delete(identity);
    });
  }

  get GrainFactory() {
    return this._grainFactory;
  }

  async invoke({ identity, method, args }) {
    return new Promise(async (resolve, reject) => {
      const uuid = this.setDeferredPromise(resolve, reject);
      this._workerManager.sendToWorker(this._grainQueueMap.get(identity).activationPid, {
        msg: Messages.INVOKE,
        identity,
        uuid,
        method,
        args
      });
    });
  }

  async getGrainActivation() {
    throw new Error('access to grain activations can only be made on workers.  Use silo.isWorker to check if you are on a worker.');
  }

  /*
   * private
   */

  async _getActivation(pid, identity, payload) {
    if (this._grainActivationMap.has(identity)) {
      // the grain is already active.  no need to queue since there is no actual work to do
      this._workerManager.sendToWorker(pid, Object.assign({}, payload, { msg: Messages.ACTIVATED }));
    } else {
      const activation = new GrainActivation(identity, this);

      activation.add(async () => new Promise((resolve, reject) => {
        const uuid = this.setDeferredPromise(
          () => {
            this._workerManager.sendToWorker(payload.fromPid, Object.assign({}, payload, { identity, msg: Messages.ACTIVATED}));
            resolve();
          },
          (error) => {
            this._workerManager.sendToWorker(payload.fromPid, Object.assign({}, payload, { identity, msg: Messages.ACTIVATION_ERROR, error }));
            reject(error);
          },
          this._config.grainActivateTimeout * 1000,
          `timeout on activation for identity ${identity}`
        );

        // send a create activation message to the next worker, and change the response uuid
        // so that the deferred promise can be resolved when the worker responds
        const msg = Object.assign({}, payload, { msg: Messages.CREATE_ACTIVATION, uuid });
        const activationPid = this._workerManager.sendToNextAvailableWorker(msg);
        activation.activationPid = activationPid;
      }));
      this._grainActivationMap.set(identity, activation);
    }
  }

  _invoke(pid, payload) {
    const activation = this._grainActivationMap.get(payload.identity);

    activation.add(async () => new Promise((resolve, reject) => {
      const uuid = this.setDeferredPromise(
        (result) => {
          this._workerManager.sendToWorker(pid, Object.assign({}, payload, { msg: Messages.INVOKE_RESULT, result }));
          resolve();
        },
        (error) => {
          this._workerManager.sendToWorker(pid, Object.assign({}, payload, { msg: Messages.INVOKE_ERROR, error }));
          reject(error);
        },
        this._config.grainInvokeTimeout * 1000,
        `timeout on invoke for identity ${payload.identity} method ${payload.method}`
      );
      // forward the invoke message to the worker containing the grain, and change the response uuid
      // so that the deferred promise can be resolved when the worker responds
      const activationPid = this._grainActivationMap.get(payload.identity).activationPid;
      this._workerManager.sendToWorker(activationPid, Object.assign({}, payload, { uuid }));
    }));
  }

  _deactivate(identity) {
    const activation = this._grainActivationMap.get(identity);

    activation.add(async () => new Promise((resolve, reject) => {
      const uuid = this.setDeferredPromise(
        () => {
          // TODO - broadcast deactivation to all workers
          resolve();
        },
        (error) => {
          winston.error(error);
          reject(error);
        },
        this._config.grainInvokeTimeout * 1000,
        `timeout on deactivate for identity ${identity}`
      );
      this._workerManager.sendToWorker(activation.activationPid, { identity, msg: Messages.DEACTIVATE, uuid });
    }));
  }

  async _processIncomingMessage(payload, pid) {
    winston.debug(`master got msg from pid ${pid}: ${JSON.stringify(payload)}`);
    const identity = this.getIdentityString(payload.grainReference, payload.key);
    switch (payload.msg) {

      case Messages.GET_ACTIVATION:
        await this._getActivation(pid, identity, Object.assign({}, payload));
        break;

      case Messages.CREATED:
        this._grainActivationMap.get(identity).activationPid = pid;
        this.getDeferredPromise(payload.uuid).resolve();
        break;

      case Messages.ACTIVATION_ERROR:
        this.getDeferredPromise(payload.uuid).reject(payload.error);
        break;

      case Messages.INVOKE:
        this._invoke(pid, payload);
        break;

      case Messages.INVOKE_RESULT:
        this.getDeferredPromise(payload.uuid).resolve(payload.result);
        break;

      case Messages.INVOKE_ERROR:
        this.getDeferredPromise(payload.uuid).reject(payload.error);
        break;

      case Messages.DEACTIVATED:
        this.getDeferredPromise(payload.uuid).resolve();
        break;

      case Messages.STOP_SILO:
        this.stop();
        break;

      default:
        break;
    }
  }

}
