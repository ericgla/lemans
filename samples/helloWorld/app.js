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
      const ref = [];
      let refStart = moment();
      for (let i = 0; i < 1000; i++) {
        const a = await GrainFactory.getGrain('HelloGrain', i);
        ref.push(a);
      }
      console.log('done.');
      console.log(moment().diff(refStart, 'milliseconds'));
      refStart = moment();
      ref.forEach(r => r.echo('test').then(c => console.log(c)));
      console.log(moment().diff(refStart, 'milliseconds'));
    } catch (e) {
      console.log(`ERROR ${e}`);
    }
  }
})();
