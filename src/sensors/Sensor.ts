import * as Babylon from 'babylonjs';

namespace Sensor {
  export namespace Output {
    export enum Type {
      None,
      Analog,
      Digital,
    }

    export namespace Type {
      export const toString = (type: Type) => {
        switch (type) {
          case Type.None: return 'None';
          case Type.Analog: return 'Analog';
          case Type.Digital: return 'Digital';
        }
        return `Unknown (${type})`;
      }
    }

    export interface None {
      type: Type.None;
    }

    export const NONE: None = { type: Type.None };

    export interface Analog {
      type: Type.Analog;
      port: number;
    }

    export const analog = (port: number): Analog => ({
      type: Type.Analog,
      port
    });

    export interface Digital {
      type: Type.Digital;
      port: number;
    }

    export const digital = (port: number): Digital => ({
      type: Type.Digital,
      port
    });
  }

  export type Output = Output.None | Output.Analog | Output.Digital;

  export enum Type {
    Et,
    Touch
  }

  export namespace Type {
    export const toString = (type: Type) => {
      switch (type) {
        case Type.Et: return 'Et';
        case Type.Touch: return 'Touch';
      }
      return `Unknown (${type})`;
    }
  }

  interface Common {
    output: Output;
  }

  export interface Et extends Common {
    type: Type.Et;
    forward: Babylon.Vector3;
    origin: Babylon.Vector3;
    maxRange?: number;
    visible?: boolean;
  }

  export namespace Et {
    export const fill = (et: Et): Et => ({
      maxRange: 30,
      visible: true,
      ...et
    });
  }

  export interface Touch extends Common {
    type: Type.Touch;
  }

  export namespace Touch {
  }
}

type Sensor = Sensor.Et | Sensor.Touch;

export default Sensor;