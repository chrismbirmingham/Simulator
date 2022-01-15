import Dict from '../../../Dict';
import Geometry from './Geometry';
import Node from './Node';
import Script from './Script';
import Patch from './Patch';

interface Scene {
  name: string;
  authorId: string;
  description: string;

  hdriUri?: string;

  geometry: Dict<Geometry>;
  nodes: Dict<Node>;
  scripts?: Dict<Script>;
}

interface PatchScene {
  name: Patch<string>;
  authorId: Patch<string>;
  description: Patch<string>;

  hdriUri?: Patch<string>;

  geometry: Dict<Patch<Geometry>>;
  nodes: Dict<Patch<Node>>;
  scripts?: Dict<Patch<Script>>;
}

namespace Scene {
  export const nodeOrdering = (scene: Scene): string[] => {
    // Find nodes with no parent
    const rootNodes = Object.keys(scene.nodes).filter(n => !scene.nodes[n].parentId);

    const children = new Map<string, string[]>();
    for (const nodeId of Object.keys(scene.nodes)) {
      const node = scene.nodes[nodeId];
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
    geometry: Patch.diffDict(a.geometry, b.geometry, Geometry.diff),
    nodes: Patch.diffDict(a.nodes, b.nodes, Node.diff),
    scripts: Patch.diffDict(a.scripts, b.scripts, Patch.diff)
  });

  export const EMPTY: Scene = {
    authorId: '',
    description: '',
    geometry: {},
    name: '',
    nodes: {},
  };
}

export default Scene;
