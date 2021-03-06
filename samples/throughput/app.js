const Silo = require('../../src/runtime/Silo');
const grains = require('./grains');
const GrainFactory = require('../../src/core/GrainFactory');
const cluster = require('cluster');
const moment = require('moment');

const iterations = 1000;

const createGrains = async () => {
  // create unique grains
  const start = moment();
  const grainPromises = [];
  for (let i = 0; i < iterations; i++) {
    grainPromises.push(GrainFactory.getGrain('EchoGrain', `${process.pid}${i}`));
  }
  const grainRefs = await Promise.all(grainPromises);
  console.log(`elapsed time for grain creation ${moment.duration(moment().diff(start)).asMilliseconds()} ms`);
  return grainRefs;
};

const invokeGrains = async (grainRefs) => {
  // invoke grain methods
  const start = moment();
  const grainPromises = [];
  for (let i = 0; i < iterations; i++) {
    grainPromises.push(grainRefs[i].echo('test'));
  }
  const results = await Promise.all(grainPromises);
  console.log(`elapsed time for grain invoke ${moment.duration(moment().diff(start)).asMilliseconds()} ms`);
  return results;
};

(async () => {
  const silo = new Silo({
    maxWorkers: 8,
    logLevel: 'info',
    grains
  });

  await silo.start();
  if (Silo.isWorker) {
    try {
      const grainRefs = await createGrains();
      await invokeGrains(grainRefs);
    } catch (e) {
      console.error(e);
    }
  }
})();

