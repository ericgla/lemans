# LeMans: Virtual actor framework for node.js

LeMans is a framework to writing distributed systems using virtual actors in JavaScript. 
It allows developers to write scalable applications while simplifying concurrency, state management and actor lifetime.

LeMans was inspired by the fine work of [Microsoft Research](https://www.microsoft.com/en-us/research/project/orleans-virtual-actors/) on 
[Orleans](http://dotnet.github.io/orleans/index.html) for the .NET framework.  LeMans shares many of the same concepts and syntax as Orleans, but has a much different implementation
due to the single-threaded nature of node and the use of isolated worker processes.

Basic Example

`npm install --save lemans`

```javascript
const Lemans = require('lemans');

(async () => {
  const silo = new Lemans.Silo({
    grains: {
      HelloGrain: class extends Lemans.Grain {
        async sayHello() {
          return `Hello from HelloGrain with key ${this.key}`;
        }
      }
    }
  });

  await silo.start();

  if (silo.isWorker) {
    try {
      const grain = await Lemans.GrainFactory.getGrain('HelloGrain', 1);
      console.log(await grain.sayHello());
    } catch (e) {
      console.error(e);
    }
  }
})();
```