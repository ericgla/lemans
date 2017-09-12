const Queue = require('../util/Queue');
const { Logger } = require('./Logger');
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
    Logger.debug(`pid ${process.pid} enqueue for identity ${this._identity} ${meta.action} new queue size ${this._methodQueue.size}`);
    if (!this._processing) {
      // start processing any queued grain calls
      this._processing = true;
      setTimeout(this._processQueueItem.bind(this), 1);
    }
  }

  async _processQueueItem() {
    if (this._methodQueue.size > 0) {
      this._processing = true;

      this._currentItem = this._methodQueue.dequeue();
      Logger.debug(`pid ${process.pid} dequeue for identity ${this._identity} ${this._currentItem.meta.action} new queue size ${this._methodQueue.size}`);
      try {
        await this._currentItem.fn();
        this._onProcessing(this._methodQueue.size, this._currentItem.meta.action);
        this._processQueueItem();
      } catch (e) {
        Logger.error(`error processing action ${this._currentItem.meta.action} on identity ${this._identity} ${e}`);
      }
    } else {
      this._processing = false;
    }
  }
};
