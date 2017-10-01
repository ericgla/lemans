const { GrainActivation } = require('../core/GrainActivation');
const cluster = require('cluster');
const SiloRuntime = require('./SiloRuntime');
const Messages = require('./Messages');
const WorkerManager = require('./WorkerManager');
const { Logger } = require('../core/Logger');

let stopMaster;

/**
 *  Silo runtime that runs on the master process.
 *
 *  This runtime acts as a broker for actions on a grain, and ensures that all actions run in sequence on a
 *  single instance of a grain.  The master runtime does not contain any actual grain instances.
 */
module.exports = class MasterRuntime extends SiloRuntime {

  constructor(silo) {
    super();
    this._silo = silo;
    this._grainActivationMap = new Map();
    this._messageHandlerMap = new Map();
    this._modules = {};
    if (silo._config._modules) {
      this._initModules(silo._config._modules);
    }
    this._workerManager = new WorkerManager(this);

    process.on('unhandledRejection', (reason, p) => {
      Logger.error('Unhandled Rejection in worker runtime at: Promise', p, 'reason:', reason);
    });
  }

  get GrainFactory() {
    return this._grainFactory;
  }

  async start() {

    this._deactivationHandle = setInterval(() => {
      const now = new Date();
      this._grainActivationMap.forEach((activation, identity) => {
        if ((now - activation.lastActivityDate) / 1000 > this._silo._config.grainDeactivateOnIdle) {
          Logger.info(`idle deactivating ${identity}`);
          this._deactivate(identity);
          this._grainActivationMap.delete(identity);
        }
      });
    }, 1 * 1000);

    return new Promise(async (resolve) => {
      this.numWorkers = this._silo._config.maxWorkers;
      Logger.info(`pid ${process.pid} starting silo master runtime with ${this.numWorkers} workers`);
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
            Logger.debug(`worker id ${worker.id} pid ${worker.process.pid} ready.`);

            this._addMessageHandlers();
            worker.on('message', async (p) => {
              Logger.debug(`master got msg from pid ${worker.process.pid}: ${JSON.stringify(p)}`);
              if (this._messageHandlerMap.has(p.msg)) {
                const handler = this._messageHandlerMap.get(p.msg);
                await handler(p, worker.process.pid);
              }
              else {
                Logger.error(`no master message handler for message ${payload.msg}`);
              }
            });

            onlineWorkers += 1;
            if (this.numWorkers === onlineWorkers) {
              Logger.info(`pid ${process.pid} all ${onlineWorkers} workers ready.`);
              Object.keys(cluster.workers).forEach((key) => {
                cluster.workers[key].send({ msg: Messages.MASTER_READY });
              });
              resolve();
            }
          }
        });
      });
      cluster.on('disconnect', () => { Logger.error('worker disconnect'); });
      cluster.on('exit', () => { Logger.error('worker exit'); });
      cluster.on('error', () => { Logger.error('worker error'); });
    });
  }

  async stop() {
    Logger.info(`pid ${process.pid} stopping silo master runtime`);
    const promises = [];
    clearInterval(this._deactivationHandle);
    this._grainActivationMap.forEach((activation, identity) => {
      Logger.info(`silo stop - deactivating ${identity}`);
      promises.push(this._deactivate(identity));
      this._grainActivationMap.delete(identity);
    });
    Promise.all(promises).then(() => {
      stopMaster();
      process.exit(0);
    });
    return new Promise((resolve) => { stopMaster = resolve; });
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

  async _initModules(modules) {
    if (modules.storage) {
      this._modules.storage = modules.storage(this.moduleApi('storage'));
    }
  }

  async _getActivation(pid, payload) {
    const identity = this.getIdentityString(payload.grainReference, payload.key);
    if (this._grainActivationMap.has(identity)) {
      // the grain is already active.  just tell the worker to create the proxy
      this._workerManager.sendToWorker(pid, Object.assign({}, payload, { msg: Messages.ACTIVATED }));
    } else {
      const activation = new GrainActivation(identity, this);

      activation.add(async () => new Promise((resolve, reject) => {
        const uuid = this.setDeferredPromise(
          () => {
            const responsePayload = Object.assign({}, payload, { identity, msg: Messages.ACTIVATED});
            this._workerManager.sendToWorker(payload.fromPid, responsePayload);
            resolve();
          },
          (error) => {
            const responsePayload = Object.assign({}, payload, { identity, msg: Messages.ACTIVATION_ERROR, error });
            this._workerManager.sendToWorker(payload.fromPid, responsePayload);
            reject(error);
          },
          this._silo._config.grainActivateTimeout * 1000,
          `timeout on activation for identity ${identity}`
        );

        // send a create activation message to the next worker, and change the response uuid
        // so that the deferred promise can be resolved when the worker responds
        const msg = Object.assign({}, payload, { msg: Messages.CREATE_ACTIVATION, uuid });
        const activationPid = this._workerManager.sendToNextAvailableWorker(msg);
        activation.activationPid = activationPid;
      }),
      { action: 'activation'}
      );
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
        this._silo._config.grainInvokeTimeout * 1000,
        `timeout on invoke for identity ${payload.identity} method ${payload.method}`
      );
      // forward the invoke message to the worker containing the grain, and change the response uuid
      // so that the deferred promise can be resolved when the worker responds
      const activationPid = this._grainActivationMap.get(payload.identity).activationPid;
      this._workerManager.sendToWorker(activationPid, Object.assign({}, payload, { uuid }));
    }),
    { action: payload.method}
    );
  }

  async _deactivate(identity, onIdle = false) {
    const activation = this._grainActivationMap.get(identity);
    let deactivated;

    activation.add(async () => new Promise((resolve, reject) => {
      const uuid = this.setDeferredPromise(
        () => {
          deactivated();
          resolve();
        },
        (error) => {
          Logger.error(error);
          reject(error);
        },
        this._silo._config.grainInvokeTimeout * 1000,
        `timeout on deactivate for identity ${identity}`
      );
      this._workerManager.broadcast({ identity, msg: Messages.DEACTIVATE, uuid });
    }),
    { action: 'deactivate' }
    );
    return new Promise((resolve) => { deactivated = resolve; });
  }

  _addMessageHandlers() {
    this._messageHandlerMap.set(Messages.GET_ACTIVATION, async (payload, pid) => this._getActivation(pid, payload));

    this._messageHandlerMap.set(Messages.CREATED, async (payload, pid) => {
      const identity = this.getIdentityString(payload.grainReference, payload.key);
      this._grainActivationMap.get(identity).activationPid = pid;
      this.getDeferredPromise(payload.uuid).resolve();
    });

    this._messageHandlerMap.set(Messages.ACTIVATION_ERROR, async (payload) => this.getDeferredPromise(payload.uuid).reject(payload.error));

    this._messageHandlerMap.set(Messages.INVOKE, async (payload, pid) => this._invoke(pid, payload));

    this._messageHandlerMap.set(Messages.INVOKE_RESULT, async (payload) => this.getDeferredPromise(payload.uuid).resolve(payload.result));

    this._messageHandlerMap.set(Messages.INVOKE_ERROR, async (payload) => this.getDeferredPromise(payload.uuid).reject(payload.error));

    this._messageHandlerMap.set(Messages.DEACTIVATE, async (payload) => this._deactivate(payload.identity, true));

    this._messageHandlerMap.set(Messages.DEACTIVATED, async (payload) => this.getDeferredPromise(payload.uuid).resolve());

    this._messageHandlerMap.set(Messages.STOP_SILO, async () => this.stop());
  }

}
