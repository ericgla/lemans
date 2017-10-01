const cluster = require('cluster');
const MasterRuntime = require('../../src/runtime/MasterRuntime');
const defaultConfig = require('../../src/config/defaults');
const Messages = require('../../src/runtime/Messages');

describe('master runtime', () => {

  let runtime;
  let sendHandler;
  let messaage;

  beforeEach(() => {
    const mockWorker = {
      process: {
        pid: 1
      },
      send: (payload) => {
        message = payload.msg;
      },
      on: (_, handler) => {
        sendHandler = handler;
        sendHandler({
          msg: Messages.WORKER_READY
        });
      }
    };
    spyOn(cluster, 'fork').andReturn(null);
    spyOn(cluster, 'on').andCallFake((_, handler) => {
      // simulate the worker start time...
      setTimeout(() => {
        handler(mockWorker);
      }, 100);
    });

    spyOn(process, 'exit').andReturn(null);
  });

  it('should start', (done) => {
    const silo = {
      _config: defaultConfig
    };

    runtime = new MasterRuntime(silo);
    runtime.start().then(() => {
      done();
    })
  });

  it('should stop', (done) => {
    expect(runtime).toBeDefined();
    runtime.stop().then(() => {
      expect(process.exit).toHaveBeenCalled();
      done();
    });
  });
});