import Dict from '../../../Dict';
import Geometry from './Geometry';
import Node from './Node';
import Script from './Script';
import { ReferenceFrame, Vector3 } from '../../../unit-math';
import Camera from './Camera';
import { Distance } from '../../../util';
import Patch from '../../../util/Patch';
import Async from '../Async';
import LocalizedString from '../../../util/LocalizedString';

interface Scene {
  name: LocalizedString;
  authorId: string;
  description: LocalizedString;
  selectedNodeId?: string;

  hdriUri?: string;

  geometry: Dict<Geometry>;
  nodes: Dict<Node>;
  scripts?: Dict<Script>;

  camera: Camera;

  gravity: Vector3;
}

export type SceneBrief = Pick<Scene, 'name' | 'authorId' | 'description'>;

export type AsyncScene = Async<SceneBrief, Scene>;

interface PatchScene {
  name: Patch<LocalizedString>;
  authorId: Patch<string>;
  description: Patch<LocalizedString>;
  selectedNodeId: Patch<string>;

  hdriUri?: Patch<string>;

  geometry: Dict<Patch<Geometry>>;
  nodes: Dict<Patch<Node>>;
  scripts?: Dict<Patch<Script>>;

  camera: Patch<Camera>;

  gravity: Patch<Vector3>;
}

namespace Scene {
  export const robots = (scene: Scene): Dict<Node.Robot> => {
    const robots: Dict<Node.Robot> = {};
    for (const id in scene.nodes) {
      const node = scene.nodes[id];
      if (node.type !== 'robot') continue;
      robots[id] = node;
    }
    return robots;
  };

  export const nodeOrdering = (scene: Scene): string[] => {
    // Find nodes with no parent
    const rootNodes = Object.keys(scene.nodes).filter(n => {
      const node = scene.nodes[n];

      return node.type === 'robot' || !node.parentId;
    });

    const children = new Map<string, string[]>();
    for (const nodeId of Object.keys(scene.nodes)) {
      const node = scene.nodes[nodeId];
      if (node.type === 'robot') continue;
      if (!node.parentId) continue;
      children.set(node.parentId, ([...(children.get(node.parentId) || []), nodeId]));
    }

    const queue = [...rootNodes];
    const visited = new Set<string>();
    const ret: string[] = [];

    while (visited.size < Object.keys(scene.nodes).length) {
      const next = queue.shift();
      if (visited.has(next)) continue;
      visited.add(next);

      ret.push(next);

      const c = children.get(next);
      if (c) ret.push(...c);
    }
    
    return ret;
  };

  export const diff = (a: Scene, b: Scene): PatchScene => ({
    name: Patch.diff(a.name, b.name),
    authorId: Patch.diff(a.authorId, b.authorId),
    description: Patch.diff(a.description, b.description),
    hdriUri: Patch.diff(a.hdriUri, b.hdriUri),
    selectedNodeId: Patch.diff(a.selectedNodeId, b.selectedNodeId),
    geometry: Patch.diffDict(a.geometry, b.geometry, Geometry.diff),
    nodes: Patch.diffDict(a.nodes, b.nodes, Node.diff),
    scripts: Patch.diffDict(a.scripts, b.scripts, Patch.diff),
    camera: Camera.diff(a.camera, b.camera),
    gravity: Patch.diff(a.gravity, b.gravity),
  });

  export const EMPTY: Scene = {
    authorId: '',
    description: { [LocalizedString.EN_US]: '' },
    geometry: {},
    name: { [LocalizedString.EN_US]: '' },
    nodes: {},
    camera: Camera.NONE,
    gravity: Vector3.zero('meters'),
  };
}

export default Scene;
