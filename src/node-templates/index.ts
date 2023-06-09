import Dict from "../Dict";
import { Vector2 } from "../math";
import { Color } from "../state/State/Scene/Color";
import Geometry from "../state/State/Scene/Geometry";
import Node from "../state/State/Scene/Node";
import { Distance, Mass } from "../util";

// TODO: Consider deep-freezing all of these objects

const canTemplate: Node.TemplatedNode<Node.Obj> = {
  type: 'object',
  geometryId: 'can',
  physics: {
    type: 'cylinder',
    mass: Mass.grams(5),
    friction: 0.7,
    restitution: 0.3,
  },
  material: {
    type: 'basic',
    color: {
      type: 'texture',
      uri: '/static/Can Texture.png'
    },
  },
  faceUvs: [Vector2.ZERO, Vector2.ZERO, Vector2.create(1, 0), Vector2.create(0, 1), Vector2.ZERO, Vector2.ZERO],
};

const lifescienceTemplate: Node.TemplatedNode<Node.Obj> = {
  type: 'object',
  geometryId: 'can',
  physics: {
    type: 'cylinder',
    mass: Mass.grams(5),
    friction: 0.7,
    restitution: 0.3,
  },
  material: {
    type: 'basic',
    color: {
      type: 'texture',
      uri: '/static/sciencepack/life_science_pack.png'
    },
  },
  faceUvs: [Vector2.ZERO, Vector2.ZERO, Vector2.create(1, 0), Vector2.create(0, 1), Vector2.ZERO, Vector2.ZERO],
};

const radscienceTemplate: Node.TemplatedNode<Node.Obj> = {
  type: 'object',
  geometryId: 'can',
  physics: {
    type: 'cylinder',
    mass: Mass.grams(5),
    friction: 0.7,
    restitution: 0.3,
  },
  material: {
    type: 'basic',
    color: {
      type: 'texture',
      uri: '/static/sciencepack/rad_science_pack.png'
    },
  },
  faceUvs: [Vector2.ZERO, Vector2.ZERO, Vector2.create(1, 0), Vector2.create(0, 1), Vector2.ZERO, Vector2.ZERO],
};

const towerTemplate: Node.TemplatedNode<Node.Obj> = {
  type: 'object',
  geometryId: 'tower',
  physics: {
    type: 'cylinder',
    mass: Mass.grams(5),
    friction: 0.7,
    restitution: 0.3,
  },
  material: {
    type: 'basic',
    color: {
      type: 'texture',
      uri: '/static/tower/tall_tower_texture.png'
    },
  },
  faceUvs: [Vector2.ZERO, Vector2.ZERO, Vector2.create(1, 0), Vector2.create(0, 1), Vector2.ZERO, Vector2.ZERO],
};

const solarTemplate: Node.TemplatedNode<Node.Obj> = {
  type: 'object',
  geometryId: 'solar',
  physics: {
    type: 'box',
    mass: Mass.grams(5),
    friction: 0.7,
    restitution: 0.3,
  },
  material: {
    type: 'basic',
    color: {
      type: 'texture',
      uri: '/static/solar.png'
    },
  },
  faceUvs: [Vector2.ZERO, Vector2.ZERO, Vector2.create(1, 0), Vector2.create(0, 1), Vector2.ZERO, Vector2.ZERO],
};

const reamTemplate: Node.TemplatedNode<Node.Obj> = {
  type: 'object',
  geometryId: 'ream',
  physics: {
    type: 'box',
    restitution: .9,
    friction: 1,
    mass: Mass.pounds(5),
  },
  material: {
    type: 'basic',
    color: {
      type: 'color3',
      color: Color.Rgb.create(250, 250, 250),
    },
  },
};

const habTemplate: Node.TemplatedNode<Node.Obj> = {
  type: 'object',
  geometryId: 'hab',
  physics: {
    type: 'mesh',
    restitution: .3,
    friction: 1,
    mass: Mass.pounds(.5),
  },
  material: {
    type: 'basic',
    color: {
      type: 'texture',
      uri: '/static/hab/hab5.png'
    },
  },
};

const basaltTemplate: Node.TemplatedNode<Node.Obj> = {
  type: 'object',
  geometryId: 'basalt',
  physics: {
    type: 'mesh',
    restitution: .3,
    friction: 1,
    mass: Mass.pounds(.5),
  },
  material: {
    type: 'basic',
    color: {
      type: 'texture',
      uri: '/static/rocks/basalt_texture_w.png'
    },
  },
};

const anorthositeTemplate: Node.TemplatedNode<Node.Obj> = {
  type: 'object',
  geometryId: 'anorthosite',
  physics: {
    type: 'mesh',
    restitution: .3,
    friction: 1,
    mass: Mass.pounds(.5),
  },
  material: {
    type: 'basic',
    color: {
      type: 'texture',
      uri: '/static/rocks/anorthosite_texture_w.png'
    },
  },
};

const brecciaTemplate: Node.TemplatedNode<Node.Obj> = {
  type: 'object',
  geometryId: 'breccia',
  physics: {
    type: 'mesh',
    restitution: .3,
    friction: 1,
    mass: Mass.pounds(.5),
  },
  material: {
    type: 'basic',
    color: {
      type: 'texture',
      uri: '/static/rocks/breccia_texture_w.png'
    },
  },
};

const meteoriteTemplate: Node.TemplatedNode<Node.Obj> = {
  type: 'object',
  geometryId: 'meteorite',
  physics: {
    type: 'mesh',
    restitution: .3,
    friction: 1,
    mass: Mass.pounds(.5),
  },
  material: {
    type: 'basic',
    color: {
      type: 'texture',
      uri: '/static/rocks/meteorite_texture_w.png'
    },
  },
};

const jbcMatATemplate: Node.TemplatedNode<Node.Obj> = {
  type: 'object',
  geometryId: 'jbc_mat_a',
  physics: {
    type: 'box',
    restitution: 0,
    friction: 1
  },
};

const jbcMatBTemplate: Node.TemplatedNode<Node.Obj> = {
  type: 'object',
  geometryId: 'jbc_mat_b',
  physics: {
    type: 'box',
    restitution: 0,
    friction: 1
  },
};

export const preBuiltTemplates = Object.freeze<Dict<Node.TemplatedNode<Node>>>({
  'can': canTemplate,
  'tower': towerTemplate,
  'solar': solarTemplate,
  'lifescience': lifescienceTemplate,
  'radscience': radscienceTemplate,
  'hab': habTemplate,
  'ream': reamTemplate,
  'basalt': basaltTemplate,
  'anorthosite': anorthositeTemplate,
  'breccia': brecciaTemplate,
  'meteorite': meteoriteTemplate,
  'jbc_mat_a': jbcMatATemplate,
  'jbc_mat_b': jbcMatBTemplate,
});


export const preBuiltGeometries = Object.freeze<Dict<Geometry>>({
  'can': {
    type: 'cylinder',
    height: Distance.centimeters(11.15),
    radius: Distance.centimeters(3),
  },
  'lifescience': {
    type: 'cylinder',
    height: Distance.centimeters(7),
    radius: Distance.centimeters(3),
  },
  'radscience': {
    type: 'cylinder',
    height: Distance.centimeters(7),
    radius: Distance.centimeters(3),
  },
  'tower': {
    type: 'cylinder',
    height: Distance.centimeters(25),
    radius: Distance.centimeters(4),
  },
  'ream': {
    type: 'box',
    size: {
      x: Distance.centimeters(27.94),
      y: Distance.centimeters(5.08),
      z: Distance.centimeters(21.59),
    },
  },
  'solar': {
    type: 'box',
    size: {
      x: Distance.centimeters(15),
      y: Distance.centimeters(5),
      z: Distance.centimeters(15),
    },
  },
  'hab': {
    type: 'sphere',
    radius: Distance.centimeters(15),
    squash: 1,
    stretch: 1,
    noise: 0,
  },
  'basalt': {
    type: 'sphere',
    radius: Distance.centimeters(3.5),
    squash: 1,
    stretch: 1,
    noise: .5,
  },
  'anorthosite': {
    type: 'sphere',
    radius: Distance.centimeters(3.5),
    squash: .8,
    stretch: 1,
    noise: 1,
  },
  'breccia': {
    type: 'sphere',
    radius: Distance.centimeters(3.5),
    squash: 1,
    stretch: 1,
    noise: 1,
  },
  'meteorite': {
    type: 'sphere',
    radius: Distance.centimeters(3.5),
    squash: 1,
    stretch: 1,
    noise: 1,
  },
  'jbc_mat_a': {
    type: 'file',
    uri: '/static/jbcMatA.glb'
  },
  'jbc_mat_b': {
    type: 'file',
    uri: '/static/jbcMatB.glb'
  },
});