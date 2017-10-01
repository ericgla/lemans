const cluster = require('cluster');
const WorkerRuntime = require('../../src/runtime/WorkerRuntime');
const defaultConfig = require('../../src/config/defaults');
const Messages = require('../../src/runtime/Messages');

describe('worker runtime', () => {

  let runtime;
  let sendHandler;
  let messaage;

  beforeEach(() => {
    const mockWorker = {
      send: (payload) => {
        message = payload.msg;
      },
      on: (_, handler) => {
        sendHandler = handler;
      }
    };
    cluster.worker = mockWorker;

    spyOn(process, 'exit').andReturn(null);
  });

  it('should start', (done) => {
    const silo = {
      _config: defaultConfig
    };

    runtime = new WorkerRuntime(silo);
    runtime.start().then(() => {
      done();
    })
    sendHandler({
      msg: Messages.MASTER_READY
    });
  });

  it('should stop', (done) => {
    expect(runtime).toBeDefined();
    runtime.stop().then(() => {
      expect(process.exit).toHaveBeenCalled();
      done();
    });
    expect(message).toBe(Messages.STOP_SILO);
    sendHandler({
      msg: Messages.STOP_WORKER
    });
  });
});