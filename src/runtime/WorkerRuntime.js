const WorkerProxyFactory = require('../core/GrainProxyFactory');
const GrainFactory = require('../core/GrainFactory.js');
const cluster = require('cluster');
const SiloRuntime = require('./SiloRuntime');
const Messages = require('./Messages');
const serializeError = require('serialize-error');
const winston = require('winston');

let workerReady;
let stopWorker;

module.exports = class WorkerRuntime extends SiloRuntime {

  constructor(config) {
    super();
    this._grainProxies = WorkerProxyFactory.create(config.grains, this);
    this._grainProxyMap = new Map();
    this._localGrainMap = new Map();
    process.on('unhandledRejection', (reason, p) => {
      winston.error('Unhandled Rejection in worker runtime at: Promise', p, 'reason:', reason);
    });
    cluster.worker.on('message', this._processIncomingMessage.bind(this));
    cluster.worker.send({ msg: Messages.WORKER_READY });
  }

  /*
   * public
   */

  async start() {
    winston.debug(`pid ${process.pid} starting silo worker runtime`);
    this._grainFactory = new GrainFactory(this);
    return new Promise((resolve) => { workerReady = resolve; });
  }

  async stop() {
    winston.info(`pid ${process.pid} stopping silo worker runtime`);
    cluster.worker.send({ msg: Messages.STOP_SILO });
    this._grainFactory = undefined;
    return new Promise((resolve) => { stopWorker = resolve; });
  }

  get GrainFactory() {
    return this._grainFactory;
  }

  /*
   *  add onDeactivate to the proxy queue.  the grain will signal the master to de-register once
   *  onDeactivate is actually called
   */
  async queueEndActivation(identity) {
    winston.debug(`pid ${process.pid} queueing deactivation for ${identity}`);
    if (this._grainProxyMap.has(identity)) {
      await this._grainProxyMap.get(identity).onDeactivate();
    } else {
      console.error(`pid ${process.pid} no activation to queue deactivation for identity ${identity}`);
    }
  }

  async deactivate(payload) {
    winston.info(`pid ${process.pid} deactivating ${payload.identity}`);
    try {
      // remove the proxy first
      if (this._grainProxyMap.has(payload.identity)) {
        this._grainProxyMap.delete(payload.identity);
      } else {
        winston.warn(`pid ${process.pid} no proxy to remove for identity ${payload.identity}`);
      }
      // if we have the grain activation local, remove it
      if (this._localGrainMap.has(payload.identity)) {
        await this._localGrainMap.get(payload.identity).onDeactivate();
        this._localGrainMap.delete(payload.identity);
      }
      cluster.worker.send(Object.assign({}, payload, { msg: Messages.DEACTIVATED }));
    } catch (e) {
      const error = serializeError(e);
      cluster.worker.send(Object.assign({}, payload, { msg: Messages.DEACTIVATED_ERROR, error }));
    }
  }

  async getGrainActivation(grainReference, key) {
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

  /*
   * private
   */

  async _processIncomingMessage(payload) {
    const p = Object.assign({}, payload);
    winston.debug(`pid ${process.pid} worker got msg: ${JSON.stringify(payload)}`);
    switch (payload.msg) {

      case Messages.MASTER_READY: {
        workerReady();
        break;
      }

      case Messages.CREATE_ACTIVATION:
        try {
          const identity = this.getIdentityString(payload.grainReference, payload.key);
          if (!this._localGrainMap.has(identity)) {
            winston.debug(`pid ${process.pid} new grain activation identity ${identity}`);

            const activation = new this._grainProxies[payload.grainReference](payload.key, identity);
            this._grainProxyMap.set(identity, activation);

            const grain = new activation._grainClass(payload.key, identity, this);
            this._localGrainMap.set(identity, grain);

            await grain.onActivate();
            cluster.worker.send(Object.assign({}, payload, { msg: Messages.CREATED }));
          }
        } catch (e) {
          const error = serializeError(e);
          cluster.worker.send(cluster.worker.send(Object.assign({}, p, {msg: Messages.ACTIVATION_ERROR, error})));
        }
        break;

      case Messages.ACTIVATED:
        const proxy = new this._grainProxies[payload.grainReference](payload.key, this.getIdentityString(payload.grainReference, payload.key));
        this._grainProxyMap.set(payload.identity, proxy);
        this.getDeferredPromise(payload.uuid).resolve(proxy);
        break;

      case Messages.ACTIVATION_ERROR:
        // reject the pending promise for this message uuid
        this.getDeferredPromise(payload.uuid).reject(payload.error);
        break;

      case Messages.INVOKE:
        const grain = await this._localGrainMap.get(payload.identity);
        try {
          const result = await grain[payload.method](...payload.args);
          cluster.worker.send(Object.assign({}, payload, { msg: Messages.INVOKE_RESULT, result }));
        } catch (e) {
          const error = serializeError(e);
          cluster.worker.send(Object.assign({}, payload, { msg: Messages.INVOKE_ERROR, error }));
        }
        break;

      case Messages.INVOKE_RESULT:
        this.getDeferredPromise(payload.uuid).resolve(payload.result);
        break;

      case Messages.DEACTIVATE:
        this.deactivate(payload);
        break;

      case Messages.INVOKE_ERROR:
        this.getDeferredPromise(payload.uuid).reject(payload.error);
        break;

      case Messages.STOP_WORKER:
        stopWorker();
        process.stop();
        break;

      default:
        break;
    }
  }

  async _getRemoteGrainActivation(grainReference, key) {
    return new Promise((resolve, reject) => {
      const uuid = this.setDeferredPromise(resolve, reject);
      winston.debug(`pid ${process.pid} sending getGrainActivation uuid ${uuid}`);
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
