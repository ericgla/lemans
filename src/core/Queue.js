class Queue {

  constructor() {
    this.storage = [];
  }

  get size() {
    return this.storage.length;
  }

  enqueue(data) {
    this.storage.push(data);
  }

  peek() {
    if (this.storage.length > 0) {
      return this.storage[0];
    }
    return null;
  }

  dequeue() {
    if (this.storage.length > 0) {
      const first = this.storage[0];
      this.storage.splice(0, 1);
      return first;
    }
    return null;
  }
}

module.exports = Queue;
