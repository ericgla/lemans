const GrainProxyFactory = require('../core/GrainProxyFactory');
const GrainFactory = require('../core/GrainFactory.js');
const cluster = require('cluster');
const SiloRuntime = require('./SiloRuntime');
const Messages = require('./Messages');
const serializeError = require('serialize-error');
const winston = require('winston');

module.exports = class SiloWorkerRuntime extends SiloRuntime {
  constructor(config) {

    super();
    this._grainProxies = {
      local: GrainProxyFactory.createLocal(config.grains, this),
      remote: GrainProxyFactory.createRemote(config.grains, this)
    };
    this._grainActivations = new Map();
    this._grainFactory = new GrainFactory(this);
    cluster.worker.on('message', this._processIncomingMessage.bind(this));
    cluster.worker.send({ msg: 'ready' });
  }

  /*
   * public
   */

  async start() {
    winston.info(`pid ${process.pid} starting silo worker runtime`);
    return Promise.resolve();
  }

  get GrainFactory() {
    return this._grainFactory;
  }

  /*
   *  add onDeactivate to the proxy queue.  the grain will signal the master to de-register once
   *  onDeactivate is actually called
   */
  async queueEndActivation(identity) {
    winston.info(`pid ${process.pid} queueing deactivation for ${identity}`);
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
    const identity = this.getIdentityString(grainReference, key);
    let activation;
    if (this._grainActivations.has(identity)) {
      activation = this._grainActivations.get(identity);
    } else {
      return this._getRemoteGrainActivation(grainReference, key);
    }
    return Promise.resolve(activation);
  }

  async invoke({ grainReference, key, method, args }) {
    return new Promise(async (resolve, reject) => {
      const uuid = this.addPromise(resolve, reject);
      winston.info(`pid ${process.pid} worker sending message to INVOKE to master`);
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
    winston.info(`pid ${process.pid} worker got msg: ${payload.grainReference} ${payload.key} ${payload.msg}`);

    switch (payload.msg) {
      case Messages.GET_ACTIVATION: {
        try {
          await this._getLocalGrainActivation(payload.grainReference, payload.key);
          winston.debug(`pid ${process.pid} worker sending msg ACTIVATED`);
          cluster.worker.send({
            msg: Messages.ACTIVATED,
            uuid: payload.uuid,
            pid: process.pid,
            activationPid: process.pid,
            grainReference: payload.grainReference,
            key: payload.key
          });
        } catch (e) {
          winston.debug(`pid ${process.pid} worker sending msg ACTIVATION_ERROR`);
          cluster.worker.send({
            msg: Messages.ACTIVATION_ERROR,
            uuid: payload.uuid,
            pid: cluster.worker.process.pid,
            grainReference: payload.grainReference,
            key: payload.key,
            error: serializeError(e) //TODO - check that the exception is an error object and handle
          });
        }
        break;
      }
      case Messages.INVOKE: {
        const activation = await this._getLocalGrainActivation(payload.grainReference, payload.key);
        const result = await activation[payload.method](...payload.args);
        winston.debug(`pid ${process.pid} worker sending msg INVOKE_RESULT`);
        cluster.worker.send({
          msg: Messages.INVOKE_RESULT,
          uuid: payload.uuid,
          pid: cluster.worker.process.pid,
          grainReference: payload.grainReference,
          key: payload.key,
          result
        });
        break;
      }
      case Messages.INVOKE_RESULT: {
        // resolve the pending promise for this message uuid
        this.getPromise(payload.uuid).resolve(payload.result);
        break;
      }
      case Messages.ACTIVATED: {
        const identity = this.getIdentityString(payload.grainReference, payload.key);
        if (payload.activationPid === process.pid && this._grainActivations.get(identity).getLocation() === 'local') {
          winston.debug(`pid ${process.pid} the requested remote activation for identity ${identity} is on our worker!`);
        }
        else {
          this._grainActivations.set(identity, new this._grainProxies.remote[payload.grainReference](payload.key, identity));
        }
        this.getPromise(payload.uuid).resolve(this._grainActivations.get(identity));
        break;
      }
      case Messages.ACTIVATION_ERROR: {
        // reject the pending promise for this message uuid
        this.getPromise(payload.uuid).reject(payload.error);
        break;
      }
      default:
        break;
    }
  }

  /*
   * returns a grain proxy object for the given grain reference and key
   */
  async _getLocalGrainActivation(grainReference, key) {
    const identity = this.getIdentityString(grainReference, key);

    if (!this._grainActivations.has(identity)) {
      // no activation exists.  Create the proxy, which also creates the grain instance
      this._grainActivations.set(identity, new this._grainProxies.local[grainReference](key, identity));
      await this._grainActivations.get(identity).onActivate();
    }
    return this._grainActivations.get(identity);
  }

  async _getRemoteGrainActivation(grainReference, key) {
    return new Promise((resolve, reject) => {
      const uuid = this.addPromise(resolve, reject);
      cluster.worker.send({
        msg: Messages.GET_ACTIVATION,
        uuid,
        pid: cluster.worker.process.pid,
        grainReference,
        key
      });
    });
  }
}
