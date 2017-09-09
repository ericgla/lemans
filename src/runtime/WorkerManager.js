const cluster = require('cluster');

/**
 * looks up the worker index by the process id
 */
const getWorkerByPid = (pid) => {
  let index;
  Object.keys(cluster.workers).forEach((key) => {
    if (cluster.workers[key].process.pid === pid) {
      index = key;
    }
  });
  return index;
};

/**
 * gets the index of the worker to send the task to.
 * for now it's simply random, but should be expanded to take other metrics into account
 * such as # of activations on the worker, worker busy time, etc
 */
const getNextWorkerIndex = (numWorkers) => {
  return Math.floor(Math.random() * (numWorkers - 1) + 1);
};

/**
 *  Provides a layer of abstraction to the transport used for messaging between workers. (incomplete)
 */

module.exports = class WorkerManager {

  constructor(runtime) {
    this._runtime = runtime;
  }

  sendToWorker(pid, message) {
    const workerIndex = getWorkerByPid(pid);
    cluster.workers[workerIndex].send(message);
  }

  sendToNextAvailableWorker(message) {
    const availableWorker = getNextWorkerIndex(this._runtime.numWorkers);
    cluster.workers[availableWorker].send(message);
    return cluster.workers[availableWorker].process.pid;
  }
}
