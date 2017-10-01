const WorkerProxyFactory = require('../core/GrainProxyFactory');
const GrainFactory = require('../core/GrainFactory.js');
const cluster = require('cluster');
const SiloRuntime = require('./SiloRuntime');
const Messages = require('./Messages');
const serializeError = require('serialize-error');
const { Logger } = require('../core/Logger');

let workerReady;
let stopWorker;

/**
 *  Silo runtime that runs on the worker process.
 *
 *  This runtime forwards all grain actions to the master runtime for sequencing, and executes actions on grain instances.
 *  The worker runtime contains the grain instances in _localGrainMap.
 */
module.exports = class WorkerRuntime extends SiloRuntime {

  constructor(silo) {
    super();
    this._silo = silo;
    this._grainProxyMap = new Map();
    this._localGrainMap = new Map();
    this._messageHandlerMap = new Map();
    this._grainFactory = new GrainFactory(this);
    process.on('unhandledRejection', (reason, p) => {
      Logger.error('Unhandled Rejection in worker runtime at: Promise', p, 'reason:', reason);
    });
  }

  async start() {
    Logger.debug(`pid ${process.pid} starting silo worker runtime`);
    this._grainProxies = WorkerProxyFactory.create(this._silo._config.grains, this);

    this._addMessageHandlers();
    cluster.worker.on('message', async (payload) => {
      Logger.debug(`pid ${process.pid} worker got msg: ${JSON.stringify(payload)}`);
      if (this._messageHandlerMap.has(payload.msg)) {
        const handler = this._messageHandlerMap.get(payload.msg);
        await handler(payload);
      }
      else {
        Logger.error(`no worker message handler for message ${payload.msg}`);
      }
    });

    cluster.worker.send({ msg: Messages.WORKER_READY });
    return new Promise((resolve) => { workerReady = resolve; });
  }

  async stop() {
    Logger.info(`pid ${process.pid} stopping silo worker runtime`);
    cluster.worker.send({ msg: Messages.STOP_SILO });
    this._grainFactory = undefined;
    return new Promise((resolve) => { stopWorker = resolve; });
  }

  get GrainFactory() {
    return this._grainFactory;
  }

  get modules() {
    return this._silo._config.modules;
  }

  /**
   *  add onDeactivate to the proxy queue.  the grain will signal the master to de-register once
   *  onDeactivate is actually called
   */
  async deactivateOnIdle(identity) {
    Logger.debug(`pid ${process.pid} queueing deactivation for ${identity}`);
  }

  async deactivate(payload) {
    Logger.info(`pid ${process.pid} deactivating ${payload.identity}`);
    try {
      // remove the proxy first
      if (this._grainProxyMap.has(payload.identity)) {
        this._grainProxyMap.delete(payload.identity);
      }
      // if we have the grain activation local, remove it
      if (this._localGrainMap.has(payload.identity)) {
        await this._localGrainMap.get(payload.identity).onDeactivate();
        this._localGrainMap.delete(payload.identity);
        cluster.worker.send(Object.assign({}, payload, { msg: Messages.DEACTIVATED }));
      }
    } catch (e) {
      const error = serializeError(e);
      cluster.worker.send(Object.assign({}, payload, { msg: Messages.DEACTIVATED_ERROR, error }));
    }
  }

  async getGrainProxy(grainReference, key) {
    if (!(grainReference in this._grainProxies)) {
      throw new Error(`unknown grain type ${grainReference}`);
    }
    const identity = this.getIdentityString(grainReference, key);
    if (this._grainProxyMap.has(identity)) {
      return Promise.resolve(this._grainProxyMap.get(identity));
    } else {
      return this._getRemoteGrainActivation(grainReference, key);
    }
  }

  async invoke({ identity, method, args }) {
    return new Promise(async (resolve, reject) => {
      const uuid = this.setDeferredPromise(resolve, reject);
      cluster.worker.send({
        msg: Messages.INVOKE,
        pid: process.pid,
        identity,
        uuid,
        method,
        args
      });
    });
  }

  async _createActivation(payload) {
    try {
      const identity = this.getIdentityString(payload.grainReference, payload.key);
      if (!this._localGrainMap.has(identity)) {
        Logger.debug(`pid ${process.pid} new grain activation identity ${identity}`);

        const activation = new this._grainProxies[payload.grainReference](payload.key, identity);
        this._grainProxyMap.set(identity, activation);

        const grain = new activation.GrainClass(payload.key, identity, this);
        this._localGrainMap.set(identity, grain);

        await grain.onActivate();
        cluster.worker.send(Object.assign({}, payload, { msg: Messages.CREATED }));
      }
    } catch (e) {
      const error = serializeError(e);
      cluster.worker.send(Object.assign({}, p, {msg: Messages.ACTIVATION_ERROR, error}));
    }
  }

  async _localInvoke(payload) {
    const grain = await this._localGrainMap.get(payload.identity);
    try {
      const result = await grain[payload.method](...payload.args);
      cluster.worker.send(Object.assign({}, payload, { msg: Messages.INVOKE_RESULT, result }));
    } catch (e) {
      const error = serializeError(e);
      cluster.worker.send(Object.assign({}, payload, { msg: Messages.INVOKE_ERROR, error }));
    }
  }

  _addMessageHandlers() {
    this._messageHandlerMap.set(Messages.MASTER_READY, () => workerReady());

    this._messageHandlerMap.set(Messages.CREATE_ACTIVATION, async payload => this._createActivation(payload));

    this._messageHandlerMap.set(Messages.ACTIVATED, async (payload) => {
      const identity = this.getIdentityString(payload.grainReference, payload.key);
      const proxy = new this._grainProxies[payload.grainReference](payload.key, identity);
      this._grainProxyMap.set(payload.identity, proxy);
      this.getDeferredPromise(payload.uuid).resolve(proxy);
    });

    this._messageHandlerMap.set(Messages.ACTIVATION_ERROR, async payload => this.getDeferredPromise(payload.uuid).reject(payload.error));

    this._messageHandlerMap.set(Messages.INVOKE, async payload => this._localInvoke(payload));

    this._messageHandlerMap.set(Messages.INVOKE_RESULT, async payload => this.getDeferredPromise(payload.uuid).resolve(payload.result));

    this._messageHandlerMap.set(Messages.INVOKE_ERROR, async payload => this.getDeferredPromise(payload.uuid).reject(payload.error));

    this._messageHandlerMap.set(Messages.DEACTIVATE, async payload => this.deactivate(payload));

    this._messageHandlerMap.set(Messages.STOP_WORKER, async () => {
      stopWorker();
      process.exit(0);
    });
  }

  async _getRemoteGrainActivation(grainReference, key) {
    return new Promise((resolve, reject) => {
      const uuid = this.setDeferredPromise(resolve, reject);
      Logger.debug(`pid ${process.pid} sending getGrainActivation uuid ${uuid}`);
      cluster.worker.send({
        msg: Messages.GET_ACTIVATION,
        fromPid: process.pid,
        uuid,
        grainReference,
        key
      });
    });
  }

}
