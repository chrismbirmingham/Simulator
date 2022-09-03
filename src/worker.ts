import Protocol from './WorkerProtocol';
import dynRequire from './require';
import SharedRegisters from './SharedRegisters';
import Registers from './RegisterState';
import python from './python';

// Proper typing of Worker is tricky due to conflicting DOM and WebWorker types
// See GitHub issue: https://github.com/microsoft/TypeScript/issues/20595
const ctx: Worker = self as unknown as Worker;

const print = (s: string) => {
  ctx.postMessage({
    type: 'program-output',
    stdoutput: s
  });
};
const printErr = (stderror: string) => {
  ctx.postMessage({
    type: 'program-error',
    stderror: stderror
  });
};

let sharedRegister_: SharedRegisters;

interface ExitStatusError extends Error {
  status: number;
}

namespace ExitStatusError {
  export const isExitStatusError = (e: Error): e is ExitStatusError => e.name === 'ExitStatus';
}

const startC = (message: Protocol.Worker.StartRequest) => {
  let stoppedSent = false;

  const sendStopped = () => {
    if (stoppedSent) return;
    ctx.postMessage({
      type: 'stopped',
    } as Protocol.Worker.StoppedRequest);
    stoppedSent = true;
  };

  const mod = dynRequire(message.code, {
    setRegister8b: (address: number, value: number) => sharedRegister_.setRegister8b(address, value),
    setRegister16b: (address: number, value: number) => sharedRegister_.setRegister16b(address, value),
    setRegister32b: (address: number, value: number) => sharedRegister_.setRegister32b(address, value),
    readRegister8b: (address: number) => sharedRegister_.getRegisterValue8b(address),
    readRegister16b: (address: number) => sharedRegister_.getRegisterValue16b(address),
    readRegister32b: (address: number) => sharedRegister_.getRegisterValue32b(address),
    onStop: sendStopped
  },
  print,
  printErr
  );

  console.log(mod);

  mod.onRuntimeInitialized = () => {
    try {
      mod._simMainWrapper();
    } catch (e) {
      if (e instanceof Error) {
        if (ExitStatusError.isExitStatusError(e)) {
          print(`Program exited with status code ${e.status}`);
        } else {
          printErr(e.message);
        }
      }

      sendStopped();
    }
  };

  ctx.postMessage({
    type: 'start'
  });
};

const runEventLoop = (): Promise<void> => new Promise((resolve, reject) => setTimeout(resolve, 5));

const startPython = async (message: Protocol.Worker.StartRequest) => {
  ctx.postMessage({
    type: 'start'
  });

  await runEventLoop();

  await python({
    code: message.code,
    print,
    printErr,
    registers: sharedRegister_,
  });
  
};

const start = async (message: Protocol.Worker.StartRequest) => {
  switch (message.language) {
    case 'c': {
      startC(message);
      break;
    }
    case 'python': {
      try {
        await startPython(message);
      } catch (e) {
        printErr(e);
      } finally {
        ctx.postMessage({
          type: 'stopped',
        } as Protocol.Worker.StoppedRequest);
      }
      break;
    }
  }
};

ctx.onmessage = (e: MessageEvent) => {
  const message = e.data as Protocol.Worker.Request;
  
  switch (message.type) {
    case 'start': {
      void start(message);
      break;
    }
    case 'set-shared-registers': {
      sharedRegister_ = new SharedRegisters(message.sharedArrayBuffer);
      break;
    }
  } 
};

// Notify main thread that worker is ready for messages
ctx.postMessage({
  type: 'worker-ready',
} as Protocol.Worker.WorkerReadyRequest);