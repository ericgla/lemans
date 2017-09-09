const winston = require('winston');
const Queue = require('../util/Queue');

/**
 *  Queues actions for a grain activation, and sends the actions sequentially to the grain instance on the worker.
 */
module.exports = class GrainQueue {

  constructor(identity, runtime, fn) {
    this._identity = identity;
    this._runtime = runtime;
    this._methodQueue = new Queue();
    this._processing = false;
    this._onProcessing = fn;
  }

  async add(fn, meta) {
    this._methodQueue.enqueue({
      fn,
      meta
    });
    winston.debug(`pid ${process.pid} enqueue for identity ${this._identity} ${meta.action} new queue size ${this._methodQueue.size}`);
    if (!this._processing) {
      // start processing any queued grain calls
      this._processing = true;
      setTimeout(this._processQueueItem.bind(this), 10);
    }
  }

  async _processQueueItem() {
    if (this._methodQueue.size > 0) {
      this._processing = true;

      this._currentItem = this._methodQueue.dequeue();
      winston.debug(`pid ${process.pid} dequeue for identity ${this._identity} ${this._currentItem.meta.action} new queue size ${this._methodQueue.size}`);
      try {
        await this._currentItem.fn();
        this._onProcessing(this._methodQueue.size, this._currentItem.meta.action);
        this._processQueueItem();
      } catch (e) {} // swallow the error here since the reject handler will have already been called to forward the error
    } else {
      this._processing = false;

    }
  }
};
