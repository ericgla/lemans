const Silo = require('../../src/runtime/Silo');
const Grain = require('../../src/core/Grain');
const GrainFactory = require('../../src/core/GrainFactory');

const delay = async (ms) => new Promise((resolve) =>{
  setTimeout(() => resolve(), ms);
});

(async () => {
  const silo = new Silo({
    grainInvokeTimeout: 2,
    logLevel: 'warn',
    grains: {
      TestGrain: class extends Grain {

        async longRunningMethod() {
          await delay(4 * 1000);
          return 'done';
        }

      }
    }
  });

  await silo.start();

  if (silo.isWorker) {
    try {
      const grain = await GrainFactory.getGrain('TestGrain', 1);
      console.log(await grain.longRunningMethod());
    } catch (e) {
      console.error(`error from grain: ${e}`);
    }
  }
})();