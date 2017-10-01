const Silo = require('../../src/runtime/Silo');
const Grain = require('../../src/core/Grain');
const StatefulGrain = require('../../src/core/StatefulGrain');
const GrainFactory = require('../../src/core/GrainFactory');
const MemoryStorage = require('../../src/modules/MemoryStorage');

const delay = async ms => new Promise((resolve) =>{
  setTimeout(() => resolve(), ms);
});

(async () => {
  const silo = new Silo({
    grainInvokeTimeout: 5,
    maxWorkers: 4,
    logLevel: 'info',
    modules: {
      storage: MemoryStorage
    },
    grains: {
      TestGrain: class extends StatefulGrain {

        async longRunningMethod(seconds) {
          await delay(seconds * 1000);
          this.setState({ test: 'test' });
          return 'done';
        }

        async onDeactivate() {
          super.onDeactivate();
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