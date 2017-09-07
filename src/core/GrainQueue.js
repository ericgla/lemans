const winston = require('winston');
const Queue = require('../util/Queue');

module.exports = class GrainQueue {

  constructor(identity, runtime, pid) {
    this._identity = identity;
    this._runtime = runtime;
    this._methodQueue = new Queue();
    this._processing = false;
    this._pid = pid;
  }

  get activationPid() {
    return this._pid;
  }

  async add(fn, action) {
    winston.debug(`master enqueue for identity ${this._identity}`);

    this._methodQueue.enqueue({
      fn,
      action
    });

    if (!this._processing) {
      // start processing any queued grain calls
      this._processing = true;
      setTimeout(this._processQueueItem.bind(this), 1);
    }
  }

  async _processQueueItem() {
    if (this._methodQueue.size > 0) {
      const item = this._methodQueue.dequeue();
      winston.debug(`pid ${process.pid} dqeueue for identity ${this._identity}`);
      try {
        await item.fn();
      } catch (e) {} // swallow the error here since the reject handler will have already been called to forward the error
      await this._processQueueItem();
    } else {
      this._processing = false;
    }
  }

};
