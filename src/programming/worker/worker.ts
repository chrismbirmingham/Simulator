import Protocol from './Protocol';
import dynRequire from '../compiler/require';
import SharedRegisters from '../registers/SharedRegisters';
import python from '../python';
import SharedRingBufferUtf32 from '../buffers/SharedRingBufferUtf32';
import SerialU32 from '../buffers/SerialU32';
import SharedRingBufferU32 from '../buffers/SharedRingBufferU32';

// Proper typing of Worker is tricky due to conflicting DOM and WebWorker types
// See GitHub issue: https://github.com/microsoft/TypeScript/issues/20595

// Global context for the worker thread.
const ctx: Worker = self as unknown as Worker;

// Shared registers and console buffer.
let sharedRegister_: SharedRegisters;
let createSerial_: SerialU32;
let sharedConsole_: SharedRingBufferUtf32;

/**
 * Prints a string to the shared console buffer, followed by a newline.
 * @param stdout - The string to be printed.
 */
const print = (stdout: string) => {
  sharedConsole_.pushStringBlocking(`${stdout}\n`);
};

/**
 * Prints an error string to the shared console buffer, followed by a newline.
 * @param stderror - The error string to be printed.
 */
const printErr = (stderror: string) => {
  sharedConsole_.pushStringBlocking(`${stderror}\n`);
};

// Define an error structure for exit status reporting.
interface ExitStatusError {
  name: string;
  message: string;
  status: number;
}

namespace ExitStatusError {
  export const isExitStatusError = (e: unknown): e is ExitStatusError => typeof e === 'object' && e['name'] === 'ExitStatus';
}

/**
 * Starts the execution of C/C++ code.
 * @param message - Message containing the code and other relevant details.
 */
const startC = (message: Protocol.Worker.StartRequest) => {
  // message.code contains the user's code compiled to javascript
  let stoppedSent = false;

  const sendStopped = () => {
    if (stoppedSent) return;

    ctx.postMessage({
      type: 'stopped',
    } as Protocol.Worker.StoppedRequest);
    stoppedSent = true;
  };

  // dynRequire is a function that takes a string of javascript code and returns a module (a function that is executed when called)
  const mod = dynRequire(message.code, {
    setRegister8b: (address: number, value: number) => {
      sharedRegister_.setRegister8b(address, value);
    },
    setRegister16b: (address: number, value: number) => {
      sharedRegister_.setRegister16b(address, value);
    },
    setRegister32b: (address: number, value: number) => {
      sharedRegister_.setRegister32b(address, value);
    },
    readRegister8b: (address: number) => sharedRegister_.getRegisterValue8b(address),
    readRegister16b: (address: number) => sharedRegister_.getRegisterValue16b(address),
    readRegister32b: (address: number) => sharedRegister_.getRegisterValue32b(address),
    createWrite: (value: number) => {
      createSerial_.tx.push(value);
    },
    createRead: () => {
      const value = createSerial_.rx.pop();
      if (value === undefined) return -1;
      return value;
    },
    onStop: sendStopped
  },
  print,
  printErr
  );

  mod.onRuntimeInitialized = () => {
    try {
      mod._main();
    } catch (e: unknown) {
      if (ExitStatusError.isExitStatusError(e)) {
        print(`Program exited with status code ${e.status}`);
      } else if (e instanceof Error) {
        printErr(e.message);
      } else {
        printErr(`Program exited with an unknown error`);
      }
    } finally {
      sendStopped();
    }
  };

  ctx.postMessage({
    type: 'start'
  });
};

/**
 * Runs the event loop for a set duration.
 * @returns Promise that resolves after a timeout.
 */
const runEventLoop = (): Promise<void> => new Promise((resolve, reject) => setTimeout(resolve, 5));

/**
 * Starts the execution of Python code.
 * @param message - Message containing the code and other relevant details.
 */
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
    createSerial: createSerial_,
  });
  
};

/**
 * Initiates the execution of code based on the specified language.
 * @param message - Message containing the code, language, and other details.
 */
const start = async (message: Protocol.Worker.StartRequest) => {
  switch (message.language) {
    case 'c':
    case 'cpp': {
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

// Message event handler for the worker.
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
    case 'set-shared-console': {
      sharedConsole_ = new SharedRingBufferUtf32(message.sharedArrayBuffer);
      break;
    }
    case 'set-create-serial': {
      createSerial_ = {
        tx: new SharedRingBufferU32(message.tx),
        rx: new SharedRingBufferU32(message.rx)
      };
    }
  } 
};

// Notify main thread that worker is ready for messages
ctx.postMessage({
  type: 'worker-ready',
} as Protocol.Worker.WorkerReadyRequest);