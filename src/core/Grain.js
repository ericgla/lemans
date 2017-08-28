class Grain {
  constructor(key) {
    this.key = key;
  }

  get getPrimaryKey() {
    return this.key;
  }
}

module.exports = Grain;
