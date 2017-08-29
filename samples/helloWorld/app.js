const assert = require('assert');
const {Silo} = require('../../src');
const grains = require('./grains');
const GrainFactory = require('../../src/core/GrainFactory');
const winston = require('winston');
const cluster = require('cluster');
const moment = require('moment');

winston.level = 'error';
(async () => {
  const silo = new Silo({
    maxWorkers: 8,
    grains
  });

  await silo.start();

  if (silo.isMaster) {
    try {
      console.log('building grain refs...');
      const g = [];
      let refStart = moment();
      for (let i = 0; i < 10000; i++) {
        g.push(GrainFactory.getGrain('HelloGrain', i));
      }
      const grainRefs = await Promise.all(g);
      console.log('done.');
      console.log(moment().diff(refStart, 'milliseconds'));

      refStart = moment();
      grainRefs.forEach(r => r.echo('test'));
      await Promise.all(g);
      console.log('done.');
      console.log(moment().diff(refStart, 'milliseconds'));
    } catch (e) {
      console.log(`ERROR ${e}`);
    }
  }
})();
