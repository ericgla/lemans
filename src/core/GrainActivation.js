const GrainQueue = require('./GrainQueue');
const { Logger } = require('./Logger');

const ActivationState = {
  ACTIVATING: 'activating',
  ACTIVATED: 'activated',
  PAUSED: 'paused',
  DEACTIVATING: 'deactivating',
  DEACTIVATED: 'deactivated'
};

/**
 *  Manages the activation of a grain in the Master Runtime.  Queues all grain instance actions and sends the actions
 *  sequentially to the grain instance on a worker.
 */
class GrainActivation {

  constructor(identity, runtime) {
    this._identity = identity;
    this._runtime = runtime;
    this._grainQueue = new GrainQueue(identity, runtime, this._onProcessing);
    this._state = ActivationState.ACTIVATING;
    this._lastActivity = new Date();
  }

  get activationPid() {
    return this._pid;
  }

  set activationPid(pid) {
    this._state = ActivationState.ACTIVATED;
    this._pid = pid;
  }

  add(fn, type = {}) {
    this._grainQueue.add(fn, type);
  }

  get state() {
    return this._state;
  }

  get lastActivityDate() {
    return this._lastActivity;
  }

  _onProcessing(size, action) {
    Logger.info(`pid ${process.pid} ${this._identity} completed ${action} pending actions: ${size}`);
    this._lastActivity = new Date();
    if (action === 'onDeactivate') {
      this._state = ActivationState.DEACTIVATING;
    }
  }
}

module.exports = {
  GrainActivation,
  ActivationState
}