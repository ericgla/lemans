const Silo = require('../../src/runtime/Silo');
const Grain = require('../../src/core/Grain');
const GrainFactory = require('../../src/core/GrainFactory');
const ConsoleLogger = require('../../src/modules/ConsoleLogger');

const delay = async ms => new Promise((resolve) =>{
  setTimeout(() => resolve(), ms);
});

(async () => {
  const silo = new Silo({
    grainInvokeTimeout: 5,
    maxWorkers: 4,
    logLevel: 'debug',
    grains: {
      TestGrain: class extends Grain {

        async longRunningMethod(seconds) {
          await delay(seconds * 1000);
          return 'done';
        }

        async onDeactivate() {
          console.log('grain onDeactivate');
        }

      }
    }
  });

  await silo.start();

  if (Silo.isWorker) {
    try {
      const grain = await GrainFactory.getGrain('TestGrain', 1);
      console.log(await grain.longRunningMethod(3));
    } catch (e) {
      console.error(`pid ${process.pid} error from grain: ${e}`);
    }
  }
})();