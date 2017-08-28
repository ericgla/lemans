const assert = require('assert');
const {Silo} = require('../../src');
const grains = require('./grains');
const GrainFactory = require('../../src/core/GrainFactory');
const winston = require('winston');
const cluster = require('cluster');

(async () => {
  const silo = new Silo({
    maxWorkers: 2,
    grains
  });

  await silo.start();

  if (silo.isMaster) {
    const grain1 = await GrainFactory.getGrain('HelloGrain', 1);
    const result = await grain1.sayHello('test');
    console.log(result);

    const grain2 = await GrainFactory.getGrain('HelloGrain', 2);
    const result2 = await grain2.sayHello('test');
    console.log(result2);
  }
})();
