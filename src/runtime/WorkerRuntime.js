const WorkerProxyFactory = require('../core/GrainActivationFactory');
const GrainFactory = require('../core/GrainFactory.js');
const cluster = require('cluster');
const SiloRuntime = require('./SiloRuntime');
const Messages = require('./Messages');
const serializeError = require('serialize-error');
const winston = require('winston');

let workerReady;

module.exports = class WorkerRuntime extends SiloRuntime {

  constructor(config) {
    super();
    this._grainProxies = WorkerProxyFactory.create(config.grains, this);
    this._grainActivations = new Map();
    this._localGrainMap = new Map();
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

  get GrainFactory() {
    return this._grainFactory;
  }

  /*
   *  add onDeactivate to the proxy queue.  the grain will signal the master to de-register once
   *  onDeactivate is actually called
   */
  async queueEndActivation(identity) {
    winston.debug(`pid ${process.pid} queueing deactivation for ${identity}`);
    if (this._grainActivations.has(identity)) {
      await this._grainActivations.get(identity).onDeactivate();
    } else {
      console.error(`pid ${process.pid} no activation to queue deactivation for identity ${identity}`);
    }
  }

  async deactivate(identity) {
    winston.info(`pid ${process.pid} deactivating ${identity}`);
    if (this._grainActivations.has(identity)) {
      this._grainActivations.delete(identity);
      cluster.worker.send({
        msg: Messages.DEACTIVATED,
        pid: cluster.worker.process.pid,
        identity
      });
    } else {
      console.error(`pid ${process.pid} no activation to deactivate for identity ${identity}`);
    }
  }

  async getGrainActivation(grainReference, key) {
    if (!(grainReference in this._grainProxies)) {
      throw new Error(`unknown grain type ${grainReference}`);
    }
    const identity = this.getIdentityString(grainReference, key);
    if (this._grainActivations.has(identity)) {
      return Promise.resolve(this._grainActivations.get(identity));
    } else {
      return this._getRemoteGrainActivation(grainReference, key);
    }
  }

  async invoke({ grainReference, key, method, args }) {
    return new Promise(async (resolve, reject) => {
      const uuid = this.setDeferredPromise(resolve, reject);
      cluster.worker.send({
        msg: Messages.INVOKE,
        pid: process.pid,
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

  async _processIncomingMessage(payload) {
    const p = Object.assign({}, payload);
    winston.debug(`pid ${process.pid} worker got msg: ${JSON.stringify(payload)}`);
    const identity = this.getIdentityString(payload.grainReference, payload.key);
    switch (payload.msg) {

      case Messages.MASTER_READY: {
        workerReady();
        break;
      }

      case Messages.CREATE_ACTIVATION:
        try {
          if (!this._localGrainMap.has(identity)) {
            winston.debug(`pid ${process.pid} new grain activation identity ${identity}`);

            const activation = new this._grainProxies[payload.grainReference](payload.key, identity);
            this._grainActivations.set(identity, activation);

            const grain = new activation._grainClass(payload.key, identity, this);
            this._localGrainMap.set(identity, grain);

            await grain.onActivate();
            cluster.worker.send(Object.assign({}, p, { msg: Messages.CREATED }));
          }
        } catch (e) {
          const error = serializeError(e);
          cluster.worker.send(cluster.worker.send(Object.assign({}, p, {msg: Messages.ACTIVATION_ERROR, error})));
        }
        break;

      case Messages.ACTIVATED:
        const proxy = new this._grainProxies[payload.grainReference](payload.key, identity);
        this._grainActivations.set(identity, proxy);
        this.getDeferredPromise(payload.uuid).resolve(proxy);
        break;

      case Messages.ACTIVATION_ERROR:
        // reject the pending promise for this message uuid
        this.getDeferredPromise(payload.uuid).reject(payload.error);
        break;

      case Messages.INVOKE:
        const grain = await this._localGrainMap.get(identity);
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

      case Messages.INVOKE_ERROR:
        this.getDeferredPromise(payload.uuid).reject(payload.error);
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
