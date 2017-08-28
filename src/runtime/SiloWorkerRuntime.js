const GrainProxyFactory = require('../core/GrainProxyFactory');
const GrainFactory = require('../core/GrainFactory.js');
const cluster = require('cluster');
const SiloRuntime = require('./SiloRuntime');
const Messages = require('./Messages');

class SiloWorkerRuntime extends SiloRuntime {
  constructor(config) {
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
    console.log(`worker ${cluster.worker.process.pid} got msg: ${payload.uuid} ${payload.msg} ${payload.grainReference} ${payload.key}`);
    switch (payload.msg) {
      case Messages.GET_ACTIVATION: {
        this.getGrainActivation(payload.grainReference, payload.key);
        console.log(`worker ${cluster.worker.process.pid} sending msg activated`);
        cluster.worker.send({
          msg: Messages.ACTIVATED,
          uuid: payload.uuid,
          pid: cluster.worker.process.pid,
          grainReference: payload.grainReference,
          key: payload.key,
        });
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
    if (this.grainActivations[grainReference] === undefined) {
      // no activation exists.  Create the proxy, which also creates the grain instance
      this.grainActivations[identity] = new this.grainProxies[grainReference](key);
    }
    return this.grainActivations[identity];
  }
}

module.exports = SiloWorkerRuntime;