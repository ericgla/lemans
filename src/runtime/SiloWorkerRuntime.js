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
    this.grainProxies = GrainProxyFactory.create(config.grains, this);
    this.grainActivations = [];
    this.grainFactory = new GrainFactory(this);
    cluster.worker.on('message', this.processIncomingMessage.bind(this));
    cluster.worker.send({ msg: 'ready' });
  }

  async start() {
    return Promise.resolve();
  }

  async processIncomingMessage(payload) {
    winston.info(`worker ${cluster.worker.process.pid} got msg: ${payload.uuid} ${payload.msg} ${payload.grainReference} ${payload.key}`);
    switch (payload.msg) {
      case Messages.GET_ACTIVATION: {
        try {
          this.getGrainActivation(payload.grainReference, payload.key);
          winston.info(`worker ${cluster.worker.process.pid} sending msg activated`);
          cluster.worker.send({
            msg: Messages.ACTIVATED,
            uuid: payload.uuid,
            pid: cluster.worker.process.pid,
            grainReference: payload.grainReference,
            key: payload.key,
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
        const activation = this.getGrainActivation(payload.grainReference, payload.key);
        const result = await activation[payload.method](...payload.args);
        cluster.worker.send({
          msg: Messages.INVOKE_RESULT,
          uuid: payload.uuid,
          pid: cluster.worker.process.pid,
          grainReference: payload.grainReference,
          key: payload.key,
          result
        });
      }
      default:
        break;
    }
  }

  /*
   * returns a grain proxy object for the given grain reference and key
   */
  getGrainActivation(grainReference, key) {
    const identity = this.getIdentityString(grainReference, key);
    if (this.grainActivations[identity] === undefined) {
      // no activation exists.  Create the proxy, which also creates the grain instance
      this.grainActivations[identity] = new this.grainProxies[grainReference](key, identity);
      this.grainActivations[identity].onActivate();
    }
    return this.grainActivations[identity];
  }

  /*
   *  add onDeactivate to the proxy queue.  the grain will signal the master to de-register once
   *  onDeactivate is actually called
   */
  async queueEndActivation(identity) {
    winston.info(`queueing deactivation for ${identity}`);
    if (this.grainActivations[identity] !== undefined) {
      await this.grainActivations[identity].onDeactivate();
    } else {
      console.error(`no activation to queue deactivation for identity ${identity}`);
    }
  }

  async deactivate(identity) {
    winston.info(`deactivating ${identity}`);
    if (this.grainActivations[identity] !== undefined) {
      this.grainActivations[identity] = undefined;
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