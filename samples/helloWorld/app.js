const Silo = require('../../src/runtime/Silo');
const Grain = require('../../src/core/Grain');
const GrainFactory = require('../../src/core/GrainFactory');

(async () => {
  const silo = new Silo({
    grains: {
      HelloGrain: class extends Grain {
        async sayHello() {
          return `Hello from HelloGrain with key ${this.key}`;
        }
      }
    }
  });

  await silo.start();

  if (silo.isWorker) {
    try {
      const grain = await GrainFactory.getGrain('HelloGrain', 1);
      console.log(await grain.sayHello());
    } catch (e) {
      console.error(e);
    }
  }
})();