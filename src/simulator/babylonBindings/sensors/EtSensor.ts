import { LinesMesh, CreateLines, Vector3, Mesh, Ray } from '@babylonjs/core';

import { SceneMeshMetadata } from '../SceneBinding';
import { Distance } from '../../../util/math/Value';
import SensorParameters from './SensorParameters';
import SensorObject from './SensorObject';
import Node from '../../../state/State/Robot/Node';
import { ReferenceFramewUnits } from '../../../util/math/unitMath';
import { clamp } from '../../../util/math/math';
import { RENDER_SCALE } from '../../../components/constants/renderConstants';


class EtSensor extends SensorObject<Node.EtSensor, number> {
  private trace_: LinesMesh;

  private static readonly DEFAULT_MAX_DISTANCE = Distance.centimeters(100);
  private static readonly DEFAULT_NOISE_RADIUS = Distance.centimeters(160);
  private static readonly FORWARD: Vector3 = new Vector3(0, 0, 1);

  constructor(parameters: SensorParameters<Node.EtSensor>) {
    super(parameters);

    const { id, scene, definition, parent } = parameters;
    const { origin, maxDistance } = definition;

    // The trace will be parented to a link that is already scaled, so we don't need to apply
    // RENDER_SCALE again.

    const rawMaxDistance = Distance.toMetersValue(maxDistance ?? EtSensor.DEFAULT_MAX_DISTANCE);

    this.trace_ = CreateLines(id, {
      points: [
        Vector3.Zero(),
        EtSensor.FORWARD.multiplyByFloats(rawMaxDistance, rawMaxDistance, rawMaxDistance)
      ],
    }, scene);
    this.trace_.visibility = 0;

    ReferenceFramewUnits.syncBabylon(origin, this.trace_, 'meters');
    this.trace_.parent = parent;
  }

  override getValue(): Promise<number> {
    const { scene, definition, links, colliders } = this.parameters;
    const { maxDistance, noiseRadius } = definition;

    const rawMaxDistance = Distance.toValue(maxDistance || EtSensor.DEFAULT_MAX_DISTANCE, RENDER_SCALE);
    this.trace_.visibility = this.visible ? 1 : 0;

    const ray = new Ray(
      this.trace_.absolutePosition,
      EtSensor.FORWARD.applyRotationQuaternion(this.trace_.absoluteRotationQuaternion),
      rawMaxDistance
    );

    const hit = scene.pickWithRay(ray, mesh => {
      const metadata = mesh.metadata as SceneMeshMetadata;
      return (
        metadata &&
        mesh !== this.trace_ &&
        !links.has(mesh as Mesh) &&
        !colliders.has(mesh as Mesh) &&
        (!!mesh.physicsImpostor || metadata.selected)
      );
    });

    const distance = hit.pickedMesh ? hit.distance : Number.POSITIVE_INFINITY;

    let value: number;
    if (!this.realistic) {
      // ideal
      if (distance >= rawMaxDistance) value = 0;
      else value = 4095 - Math.floor((distance / rawMaxDistance) * 4095);
    } else {
      // realistic
      if (distance >= rawMaxDistance) value = 1100;
      // Farther than 80 cm
      else if (distance >= 80) value = 345;
      // Closer than 3 cm (linear from 2910 to 0)
      else if (distance <= 3) value = Math.floor(distance * (2910 / 3));
      // 3 - 11.2 cm
      else if (distance <= 11.2) value = 2910;
      // 11.2 - 80 cm (the useful range)
      // Derived by fitting the real-world data to a power model
      else value = Math.floor(3240.7 * Math.pow(distance - 10, -0.776));
    }

    if (this.noisy) {
      const noise = Distance.toValue(noiseRadius || EtSensor.DEFAULT_NOISE_RADIUS, RENDER_SCALE);
      const offset = Math.floor(noise * Math.random() * 2) - noise;
      value -= offset;
    }

    return Promise.resolve(clamp(0, value, 4095));
  }

  override dispose(): void {
    this.trace_.dispose();
  }
}

export default EtSensor;