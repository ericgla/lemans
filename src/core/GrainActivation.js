const GrainQueue = require('./GrainQueue');

const ActivationState = {
  ACTIVATING: 'activating',
  ACTIVATED: 'activated',
  PAUSED: 'paused',
  DEACTIVATING: 'deactivating',
  DEACTIVATED: 'deactivated'
};

class GrainActivation {

  constructor(identity, runtime) {
    this._identity = identity;
    this._runtime = runtime;
    this._grainQueue = new GrainQueue(identity, runtime);
    this._grainQueue.onProcessing(() => this._onProcessing);
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

  add(fn, type) {
    this._grainQueue.add(fn, type);
  }

  get state() {
    return this._state;
  }

  get lastActivityDate() {
    return this._lastActivity;
  }

  _onProcessing(size, type) {
    this._lastActivity = new Date();
    if (type === 'onDeactivate') {
      this._state = ActivationState.DEACTIVATING;
    }
  }
}

module.exports = {
  GrainActivation,
  ActivationState
}