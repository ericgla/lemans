const Silo = require('../../src/runtime/Silo');
const grains = require('./grains');
const GrainFactory = require('../../src/core/GrainFactory');

(async () => {
  const silo = new Silo({
    maxWorkers: 8,
    logLevel: 'info',
    grains
  });

  await silo.start();

  if (silo.isMaster) {
    try {
      const grain = await GrainFactory.getGrain('HelloGrain', 1);
      const result = await grain.echo('test');
      console.log(result);
    } catch (e) {
      console.log(`ERROR ${e}`);
    }
  }
})();
