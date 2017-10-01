const { Logger } = require('../core/Logger');

module.exports = () => {

  Logger.info('using Memory storage module');

  const map = new Map();

  return {
    name: 'MemoryStorage',
    read: (key) => {
      return map.get(key);
    },
    write: (key, value) => {
      map.set(key, value);
    },
    clear: (key) => {
      map.delete(key);
    }
  };
}