const GrainProxyFactory = require('../core/GrainProxyFactory');
const GrainFactory = require('../core/GrainFactory.js');
const cluster = require('cluster');
const SiloRuntime = require('./SiloRuntime');
const Messages = require('./Messages');
const serializeError = require('serialize-error');
const winston = require('winston');

class SiloWorkerRuntime extends SiloRuntime {
  constructor(config) {
    winston.info(`initializing worker runtime pid ${process.pid}`)
    super();
    this.grainProxies = {
      local: GrainProxyFactory.createLocal(config.grains, this),
      remote: GrainProxyFactory.createRemote(config.grains, this)
    };
    this.grainActivations = new Map();
    this.grainFactory = new GrainFactory(this);
    cluster.worker.on('message', this.processIncomingMessage.bind(this));
    cluster.worker.send({ msg: 'ready' });
  }

  async start() {
    return Promise.resolve();
  }

  get GrainFactory() {
    return this.grainFactory;
  }

  async processIncomingMessage(payload) {
    winston.info(`worker ${cluster.worker.process.pid} 
      got msg: ${payload.uuid} ${payload.msg} ${payload.grainReference} ${payload.key}`);

    switch (payload.msg) {
      case Messages.GET_ACTIVATION: {
        try {
          await this.getLocalGrainActivation(payload.grainReference, payload.key);
          winston.info(`worker ${cluster.worker.process.pid} sending msg activated`);
          cluster.worker.send({
            msg: Messages.ACTIVATED,
            uuid: payload.uuid,
            pid: process.pid,
            activationPid: process.pid,
            grainReference: payload.grainReference,
            key: payload.key
          });
        } catch (e) {
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
        const activation = await this.getLocalGrainActivation(payload.grainReference, payload.key);
        const result = await activation[payload.method](...payload.args);
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
        if (payload.activationPid === process.pid && this.grainActivations.get(identity).getLocation() === 'local') {
          winston.info(`the requestion remote activation for identity ${identity} is on our worker!`);
        }
        else {
          this.grainActivations.set(identity, new this.grainProxies.remote[payload.grainReference](payload.key, identity));
        }
        this.getPromise(payload.uuid).resolve(this.grainActivations.get(identity));
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
  async getLocalGrainActivation(grainReference, key) {
    const identity = this.getIdentityString(grainReference, key);

    if (!this.grainActivations.has(identity)) {
      // no activation exists.  Create the proxy, which also creates the grain instance
      this.grainActivations.set(identity, new this.grainProxies.local[grainReference](key, identity));
      await this.grainActivations.get(identity).onActivate();
    }

    return this.grainActivations.get(identity);
  }

  async getRemoteGrainActivation(grainReference, key) {
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

  async getGrainActivation(grainReference, key) {
    const identity = this.getIdentityString(grainReference, key);
    let activation;
    if (this.grainActivations.has(identity)) {
      activation = this.grainActivations.get(identity);
    } else {
      return this.getRemoteGrainActivation(grainReference, key);
    }
    return Promise.resolve(activation);
  }

  async invoke({ grainReference, key, method, args }) {
    return new Promise(async (resolve, reject) => {
      const uuid = this.addPromise(resolve, reject);
      winston.info(`worker sending message to invoke ref ${grainReference} key ${key} ${method} to master`);
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
   *  add onDeactivate to the proxy queue.  the grain will signal the master to de-register once
   *  onDeactivate is actually called
   */
  async queueEndActivation(identity) {
    winston.info(`queueing deactivation for ${identity}`);
    if (this.grainActivations.has(identity)) {
      await this.grainActivations.get(identity).onDeactivate();
    } else {
      console.error(`no activation to queue deactivation for identity ${identity}`);
    }
  }

  async deactivate(identity) {
    winston.info(`deactivating ${identity}`);
    if (this.grainActivations.has(identity)) {
      this.grainActivations.delete(identity);
      cluster.worker.send({
        msg: Messages.DEACTIVATED,
        pid: cluster.worker.process.pid,
        identity
      });
    } else {
      console.error(`no activation to deactivate for identity ${identity}`);
    }
  }
}

module.exports = SiloWorkerRuntime;