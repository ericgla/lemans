const Storage = require('./Storage');

module.exports = class MemoryStorage extends Storage {
  readState() {}
  writeState(state) {}
  clearState() {}
}