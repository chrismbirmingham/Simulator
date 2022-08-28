namespace Geometry {
  export enum Type {
    LocalMesh = 'local-mesh',
    RemoteMesh = 'remote-mesh',
  }

  export interface LocalMesh {
    type: Type.LocalMesh;

    /// The format of the mesh data.
    format: LocalMesh.Format;
    
    /// Base 64 encoded mesh data.
    data: string;
  }

  export namespace LocalMesh {
    export enum Format {
      Gltf = 'gltf',
      Glb = 'glb',
    }
  }

  export interface RemoteMesh {
    type: Type.RemoteMesh;

    /// The URI of the mesh data. Format is derived from the file extension or MIME type.
    uri: string;

    include?: string[];
  }
}

type Geometry = (
  Geometry.LocalMesh |
  Geometry.RemoteMesh
);

export default Geometry;