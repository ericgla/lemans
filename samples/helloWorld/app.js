const assert = require('assert');
const {Silo} = require('../../src');
const grains = require('./grains');
const GrainFactory = require('../../src/core/GrainFactory');
const winston = require('winston');
const cluster = require('cluster');

(async () => {
  const silo = new Silo({
    maxWorkers: 1,
    grains
  });

  await silo.start();

  if (silo.isMaster) {
    try {
      const grain1 = await GrainFactory.getGrain('HelloGrain', 1);
      const result = await grain1.sayHello('test');
      console.log(result);
    } catch (e) {
      console.log(`ERROR ${e}`);
    }
  }
})();
