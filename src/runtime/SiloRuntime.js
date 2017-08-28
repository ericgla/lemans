class SiloRuntime {
  getIdentityString(grainReference, key) {
    return `${grainReference}_${key}`;
  }
}
module.exports = SiloRuntime;