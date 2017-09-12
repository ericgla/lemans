const Storage = require('../core/Storage');

module.exports = class MemoryStorage extends Storage {
  readState(identity) {}
  writeState(identity, state) {}
  clearState(identity) {}
}