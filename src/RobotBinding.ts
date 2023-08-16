import { Scene as BabylonScene } from '@babylonjs/core/scene';
import { TransformNode as BabylonTransformNode } from '@babylonjs/core/Meshes/transformNode';
import { AbstractMesh as BabylonAbstractMesh } from '@babylonjs/core/Meshes/abstractMesh';
import { LinesMesh as BabylonLinesMesh } from '@babylonjs/core/Meshes/linesMesh';
import { PhysicsViewer as BabylonPhysicsViewer } from '@babylonjs/core/Debug/physicsViewer';
import { BoxBuilder as BabylonBoxBuilder } from '@babylonjs/core/Meshes/Builders/boxBuilder';
import { SphereBuilder as BabylonSphereBuilder } from '@babylonjs/core/Meshes/Builders/sphereBuilder';
import { IcoSphereBuilder as BabylonIcoSphereBuilder } from '@babylonjs/core/Meshes/Builders/icoSphereBuilder'; 
import { CreateLines as BabylonCreateLines } from '@babylonjs/core/Meshes/Builders/linesBuilder';
import { Vector3 as BabylonVector3, Quaternion as BabylonQuaternion } from '@babylonjs/core/Maths/math.vector';
import { StandardMaterial as BabylonStandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { IPhysicsEnabledObject as BabylonIPhysicsEnabledObject } from '@babylonjs/core/Physics/physicsImpostor';
import { PhysicsBody, PhysicsConstraintAxis, Physics6DoFConstraint, PhysicsConstraintAxisLimitMode, PhysicsMotionType, PhysicsShape, PhysicsAggregate, PhysicsShapeType, PhysicsConstraintMotorType, PhysicShapeOptions, PhysicsShapeParameters, IPhysicsCollisionEvent, LockConstraint, PhysicsShapeSphere, PhysicsShapeContainer } from '@babylonjs/core';
import { SpotLight as BabylonSpotLight } from '@babylonjs/core/Lights/spotLight';
import { DirectionalLight as BabylonDirectionalLight } from '@babylonjs/core/Lights/directionalLight';
import { HemisphericLight as BabylonHemisphericLight } from '@babylonjs/core/Lights/hemisphericLight';
import { Mesh as BabylonMesh } from '@babylonjs/core/Meshes/mesh';
import { SceneLoader as BabylonSceneLoader } from '@babylonjs/core/Loading/sceneLoader';
import { MotorEnabledJoint as BabylonMotorEnabledJoint, PhysicsJoint as BabylonPhysicsJoint, HingeJoint as BabylonHingeJoint } from '@babylonjs/core/Physics/physicsJoint';
import { Ray as BabylonRay } from '@babylonjs/core/Culling/ray';

import '@babylonjs/core/Physics/physicsEngineComponent';

import SceneNode from './state/State/Scene/Node';
import Robot from './state/State/Robot';
import Node from './state/State/Robot/Node';
import { Quaternion, Vector3 as RawVector3, clamp, Euler } from './math';
import { ReferenceFrame, Rotation, Vector3 } from './unit-math';
import { Angle, Distance, Mass } from './util/Value';
import { SceneMeshMetadata } from './SceneBinding';
import Geometry from './state/State/Robot/Geometry';
import Dict from './Dict';
import { RENDER_SCALE, RENDER_SCALE_METERS_MULTIPLIER } from './renderConstants';
import WriteCommand from './AbstractRobot/WriteCommand';
import AbstractRobot from './AbstractRobot';
import Motor from './AbstractRobot/Motor';

interface BuiltGeometry {
  nonColliders: BabylonMesh[];
  colliders?: BuiltGeometry.Collider[];
}

namespace BuiltGeometry {
  export interface Collider {
    name: string;
    mesh: BabylonMesh;
    type: number;
    volume: number;
  }
}

class RobotBinding {
  private bScene_: BabylonScene;

  private robot_: Robot;
  get robot() { return this.robot_; }

  private childrenNodeIds_: Dict<string[]>;

  private rootId_: string;
  private robotSceneId_: string;

  private links_: Dict<BabylonMesh> = {};

  get links() { return this.links_; }

  private weights_: Dict<BabylonMesh> = {};
  private fixed_: Dict<BabylonPhysicsJoint> = {};
  private motors_: Dict<Physics6DoFConstraint> = {};
  private servos_: Dict<Physics6DoFConstraint> = {};
  private motorPorts_ = new Array<string>(4);
  private servoPorts_ = new Array<string>(4);

  private digitalSensors_: Dict<RobotBinding.Sensor<boolean>> = {};
  private digitalPorts_ = new Array<string>(6);

  private analogSensors_: Dict<RobotBinding.Sensor<number>> = {};
  private analogPorts_ = new Array<string>(6);

  private colliders_: Set<BabylonMesh> = new Set();

  private physicsViewer_: BabylonPhysicsViewer;

  constructor(bScene: BabylonScene, physicsViewer?: BabylonPhysicsViewer) {
    this.bScene_ = bScene;
    this.physicsViewer_ = physicsViewer;
  }

  private buildGeometry_ = async (name: string, geometry: Geometry): Promise<BuiltGeometry> => {
    let ret: BuiltGeometry;

    switch (geometry.type) {
      case 'remote-mesh': {
        const index = geometry.uri.lastIndexOf('/');
        const fileName = geometry.uri.substring(index + 1);
        const baseName = geometry.uri.substring(0, index + 1);
  
        const res = await BabylonSceneLoader.ImportMeshAsync(geometry.include ?? '', baseName, fileName, this.bScene_);
        
        const nonColliders: BabylonMesh[] = [];
        const colliders: BuiltGeometry.Collider[] = [];

        for (const mesh of res.meshes.slice(1) as BabylonMesh[]) {

          if (mesh.name.startsWith('collider')) {
            const parts = mesh.name.split('-');
            if (parts.length !== 3) throw new Error(`Invalid collider name: ${mesh.name}`);
            const [_, type, name] = parts;

            const { extendSize } = mesh.getBoundingInfo().boundingBox;

            const volume = extendSize.x * extendSize.y * extendSize.z;

            let bType: number;
            switch (type) {
              case 'box': bType = PhysicsShapeType.BOX; break;
              case 'sphere': bType = PhysicsShapeType.SPHERE; break;
              case 'cylinder': bType = PhysicsShapeType.CYLINDER; break;
              case 'capsule': bType = PhysicsShapeType.CAPSULE; break;
              case 'plane': bType = PhysicsShapeType.HEIGHTFIELD; break;
              case 'mesh': bType = PhysicsShapeType.MESH; break;
              default: throw new Error(`Invalid collider type: ${type}`);
            }
            // mesh.position.y = 10;
            colliders.push({ mesh, type: bType, name, volume });
          } else {
            // mesh.position.y = 10;
            nonColliders.push(mesh);
          }
        }

        // const meshes = [BabylonMesh.MergeMeshes(nonColliders, true, true, undefined, false, true)];
        // meshes.visibility = 0;
        ret = { nonColliders, colliders };
        break; 
      }
      default: {
        throw new Error(`Unsupported geometry type: ${geometry.type}`);
      }
    }

    return ret;
  };


  private createLink_ = async (id: string, link: Node.Link) => {
    // console.log(`Creating link: ${id}`, link);
    let builtGeometry: BuiltGeometry;
    if (link.geometryId === undefined) {
      builtGeometry = { nonColliders: [new BabylonMesh(id, this.bScene_)] };
    } else {
      const geometry = this.robot_.geometry[link.geometryId];
      if (!geometry) throw new Error(`Missing geometry: ${link.geometryId}`);
      builtGeometry = await this.buildGeometry_(id, geometry);
    }
    
    const meshes = builtGeometry.nonColliders;
    let myMesh: BabylonMesh;

    const inertiaScale = .5;
    
    switch (link.collisionBody.type) {

      case Node.Link.CollisionBody.Type.Box: {
        alert("box collision body");
        myMesh = BabylonMesh.MergeMeshes(meshes, true, true, undefined, false, true);
        // We assume the mesh is defined in meters. Bring it into our default scaling.
        myMesh.scaling.scaleInPlace(RENDER_SCALE_METERS_MULTIPLIER);
        // const body = new PhysicsBody(mesh, PhysicsMotionType.DYNAMIC, false, this.bScene_);
        // const aggregate = new PhysicsAggregate(mesh, PhysicsShapeType.BOX, {
        //   mass: Mass.toGramsValue(link.mass || Mass.grams(1)),
        //   friction: link.friction ?? 0.5,
        //   restitution: link.restitution ?? 0,
        // }, this.bScene_);
        // const body = new PhysicsBody(mesh, PhysicsMotionType.DYNAMIC, false, this.bScene_);
        // const parameters: PhysicsShapeParameters = { mesh: mesh };
        // const type = PhysicsShapeType.BOX;
    
        // const options: PhysicShapeOptions = { type: type, parameters: parameters };
        // const shape = new PhysicsShape(options, this.bScene_);
        // shape.material = {
        //   friction: link.friction ?? 0.5,
        //   restitution: link.restitution ?? 0,
        // };
        // body.shape = shape;
        // body.setMassProperties({ mass: Mass.toGramsValue(link.mass || Mass.grams(1)) });

        this.colliders_.add(myMesh);
        break;
      }
      case Node.Link.CollisionBody.Type.Cylinder: {
        myMesh = BabylonMesh.MergeMeshes(meshes, true, true, undefined, false, true);
        myMesh.scaling.scaleInPlace(RENDER_SCALE_METERS_MULTIPLIER);
        // myMesh.position.y -= .1;

        // const body = new PhysicsBody(mesh, PhysicsMotionType.DYNAMIC, false, this.bScene_);

        const aggregate = new PhysicsAggregate(myMesh, PhysicsShapeType.CYLINDER, {
          mass: Mass.toGramsValue(link.mass || Mass.grams(10)),
          // mass: Mass.toGramsValue(link.mass || Mass.grams(10)),
          friction: 100, // link.friction ?? 0.5,
          restitution: 0, // link.restitution ?? 0,
          startAsleep: true,
        }, this.bScene_);

        // aggregate.body.setMassProperties({
        //   mass: Mass.toGramsValue(Mass.grams(80)), 
        //   // inertia: new BabylonVector3(5,5,0)
        // });
        // aggregate.body.setLinearDamping(1);

        // if (this.physicsViewer_ && myMesh.physicsBody) this.physicsViewer_.showBody(myMesh.physicsBody);
        this.colliders_.add(myMesh);
        break;
      }
      case Node.Link.CollisionBody.Type.Embedded: {
        // if (link.geometryId.includes("chassis")) {
        //   for (const mesh of meshes) {
        //     mesh.position.y -= .3;
        //   }
        // }
        myMesh = BabylonMesh.MergeMeshes(meshes, true, true, undefined, false, true);
        myMesh.scaling.scaleInPlace(RENDER_SCALE_METERS_MULTIPLIER);
        const parentShape = new PhysicsShapeContainer(this.bScene_);
        // console.log("embedded body setup:", link.geometryId);
        // if (link.geometryId.includes("chassis")) {
        //   myMesh.position.y -= .3;
        //   myMesh.absolutePosition.y -= .3;
        // }

        for (const collider of builtGeometry.colliders ?? []) {
          const bCollider = collider.mesh;
          // if (link.geometryId.includes("chassis")) {
          //   bCollider.position.y -= .3;
          // }

          bCollider.parent = myMesh;

          const parameters: PhysicsShapeParameters = { mesh: bCollider };
          const options: PhysicShapeOptions = { type: PhysicsShapeType.MESH, parameters: parameters };
          const shape = new PhysicsShape(options, this.bScene_);
          shape.material = {
            friction: link.friction ?? 0.5,
            // restitution: link.restitution ?? 0,
            restitution: 0.1,
          };

          parentShape.addChild(shape, bCollider.absolutePosition, bCollider.absoluteRotationQuaternion);

          bCollider.visibility = 0;
          this.colliders_.add(bCollider);
          
        }
        
        const body = new PhysicsBody(myMesh, PhysicsMotionType.DYNAMIC, false, this.bScene_);
        body.shape = parentShape;
        if (link.geometryId.includes("chassis")) {
          // myMesh.position.y = 10;
          body.setMassProperties({ 
            mass: Mass.toGramsValue(link.mass || Mass.grams(100)),
            inertia: new BabylonVector3(20 * inertiaScale,20 * inertiaScale,20 * inertiaScale) // (left/right, twist around, rock forward and backward)
          }); 
          // body.setAngularDamping(.5);
          // body.setLinearDamping(.1);
          // myMesh.physicsBody.disablePreStep = false;
          // myMesh.setAbsolutePosition(new BabylonVector3(
          //   Distance.toCentimetersValue(Distance.centimeters(0)),
          //   Distance.toCentimetersValue(Distance.centimeters(50)),
          //   Distance.toCentimetersValue(Distance.centimeters(0)))
          // );
          // myMesh.setDirection(new BabylonVector3(0,0,0), 0, 0, Math.PI / 4);
          // myMesh.rotationQuaternion = new BabylonQuaternion(0,0,0,2);
        }
        if (link.geometryId.includes("arm")) {
          body.setMassProperties({ 
            mass: Mass.toGramsValue(link.mass || Mass.grams(80)), 
            inertia: new BabylonVector3(6 * inertiaScale,6 * inertiaScale,6 * inertiaScale) // (left/right, twist around, rock forward and backward)
          });
        }
        if (link.geometryId.includes("claw")) {
          body.setMassProperties({ 
            mass: Mass.toGramsValue(link.mass || Mass.grams(10)),
            inertia: new BabylonVector3(3 * inertiaScale,3 * inertiaScale,3 * inertiaScale) // (left/right, twist around, rock forward and backward)
          });
        }
        
        // if (this.physicsViewer_ && myMesh.physicsBody) this.physicsViewer_.showBody(myMesh.physicsBody);
        this.colliders_.add(myMesh);

        break;
      }
      default: {
        throw new Error(`Unsupported collision body type: ${link.collisionBody.type}`);
      }
    }

    // if (this.physicsViewer_ && myMesh.physicsBody) this.physicsViewer_.showBody(myMesh.physicsBody);

    // myMesh.position.set(
    //   Distance.toCentimetersValue(Distance.centimeters(0)),
    //   Distance.toCentimetersValue(Distance.centimeters(50)),
    //   Distance.toCentimetersValue(Distance.centimeters(0))
    // );
    console.log("My Mesh:", myMesh);
    
    return myMesh;
  };

  private createSensor_ = <T extends Node.FrameLike, O, S extends RobotBinding.SensorObject<T, O>>(s: { new(parameters: RobotBinding.SensorParameters<T>): S }) => (id: string, definition: T): S => {
    const parent = this.links_[definition.parentId];
    
    return new s({
      id,
      definition,
      parent,
      scene: this.bScene_,
      links: new Set(Object.values(this.links_)),
      colliders: this.colliders_,
    });
  };

  private createTouchSensor_ = this.createSensor_(RobotBinding.TouchSensor);
  private createEtSensor_ = this.createSensor_(RobotBinding.EtSensor);
  private createLightSensor_ = this.createSensor_(RobotBinding.LightSensor);
  private createReflectanceSensor_ = this.createSensor_(RobotBinding.ReflectanceSensor);

  // Transform a vector using the child frame's orientation. This operation is invariant on a single
  // axis, so we return a new quaternion with the leftover rotation.
  private static connectedAxisAngle_ = (rotationAxis: BabylonVector3, childOrientation: BabylonQuaternion): { axis: BabylonVector3, twist: BabylonQuaternion } => {
    const childOrientationInv = childOrientation.invert();
    const axis = rotationAxis.applyRotationQuaternion(childOrientationInv);
    const v = new BabylonVector3(childOrientationInv.x, childOrientationInv.y, childOrientationInv.z);
    const s = childOrientationInv.w;
    v.multiplyInPlace(axis);

    const twist = new BabylonQuaternion(v.x, v.y, v.z, s);
    twist.normalize();

    
    return {
      axis,
      twist,
    };
  };

  private createWeight_ = (id: string, weight: Node.Weight) => {
    // console.log(`Creating weight: ${id}`);
    const ret = BabylonSphereBuilder.CreateSphere(id, { diameter: 1 }, this.bScene_);
    ret.visibility = 1;

    const parent = this.robot_.nodes[weight.parentId];
    if (!parent) throw new Error(`Missing parent: "${weight.parentId}" for weight "${id}"`);
    if (parent.type !== Node.Type.Link) throw new Error(`Invalid parent type: "${parent.type}" for weight "${id}"`);

    const aggregate = new PhysicsAggregate(ret, PhysicsShapeType.CYLINDER, {
      mass: Mass.toGramsValue(weight.mass),
      friction: 0,
      restitution: 0,
    }, this.bScene_);

    // const sphereShape = new PhysicsShapeSphere(new BabylonVector3(0,0,0),1, this.bScene_);
    // const sphereBody = new PhysicsBody(ret, PhysicsMotionType.DYNAMIC, false, this.bScene_);
    // sphereBody.shape = sphereShape;
    // sphereBody.setMassProperties({ mass: Mass.toGramsValue(weight.mass) });

    const bParent = this.links_[weight.parentId];
    if (!bParent) throw new Error(`Missing parent instantiation: "${weight.parentId}" for weight "${id}"`);

    const bOrigin = ReferenceFrame.toBabylon(weight.origin, RENDER_SCALE);

    // mainPivot: bOrigin.position,
    // mainAxis: BabylonVector3.Up(),
    // connectedPivot: BabylonVector3.Zero(),
    // connectedAxis: BabylonVector3.Up().applyRotationQuaternion(bOrigin.rotationQuaternion.invert()),

    const constraint = new LockConstraint(
      bOrigin.position,
      new BabylonVector3(0,0,0), // RawVector3.toBabylon(new BabylonVector3(-8,10,0)), // updown, frontback
      BabylonVector3.Up(),
      BabylonVector3.Up().applyRotationQuaternion(bOrigin.rotationQuaternion.invert()),
      this.bScene_
    );
    bParent.physicsBody.addConstraint(ret.physicsBody, constraint);
    // console.log(`Created weight:`, weight);

    return ret;
  };

  private bParentChild_ = (id: string, parentId: string): {
    bParent: BabylonMesh;
    bChild: BabylonMesh;
    childId: string;
  } => {
    if (!parentId) throw new Error(`Missing parent: "${parentId}" for node "${id}"`);
    
    const children = this.childrenNodeIds_[id];
    if (children.length !== 1) throw new Error(`"${id}" must have exactly one child`);

    const childId = children[0];

    const bParent = this.links_[parentId];
    if (!bParent) throw new Error(`Missing link: ${parentId}`);

    const bChild = this.links_[childId];
    if (!bChild) throw new Error(`Missing link: ${childId}`);

    return {
      bParent,
      bChild,
      childId,
    };
  };

  private createHinge_ = (id: string, hinge: Node.HingeJoint & { parentId: string }) => {
    console.log(`Creating hinge:`, id, hinge.parentId);
    const { bParent, bChild } = this.bParentChild_(id, hinge.parentId);
    
    const childAxis = hinge.childAxis || hinge.parentAxis;
    const bChildAxis = RawVector3.toBabylon(childAxis);

    if (hinge.childTwist) {
      bChild.rotationQuaternion = BabylonQuaternion.RotationAxis(bChildAxis, Angle.toRadiansValue(hinge.childTwist));
      bChild.computeWorldMatrix(true);
    }

    const joint: Physics6DoFConstraint = new Physics6DoFConstraint({
      pivotA: Vector3.toBabylon(hinge.parentPivot, RENDER_SCALE),
      pivotB: Vector3.toBabylon(hinge.childPivot, RENDER_SCALE),
      axisA: new BabylonVector3(1,0,0),
      axisB: new BabylonVector3(1,0,0),
      perpAxisA: new BabylonVector3(0,-1,0), // bChildAxis, //
      perpAxisB: RawVector3.toBabylon(hinge.parentAxis), // new BabylonVector3(0,0,-1), // RawVector3.toBabylon(hinge.parentAxis),
    },
    [
      {
        axis: PhysicsConstraintAxis.LINEAR_X,
        minLimit: 0, maxLimit: 0, 
        // damping: 10000000000, stiffness: 1000000000
      },
      {
        axis: PhysicsConstraintAxis.LINEAR_Y,
        minLimit: 0, maxLimit: 0, 
        // damping: 10000000000, stiffness: 1000000000
      },
      {
        axis: PhysicsConstraintAxis.LINEAR_Z,
        minLimit: 0, maxLimit: 0, 
        // damping: 10000000000, stiffness: 1000000000
      },
      { // also important
        axis: PhysicsConstraintAxis.ANGULAR_Y,
        minLimit: 0, maxLimit: 0,
      },
      { // definitely important
        axis: PhysicsConstraintAxis.ANGULAR_X,
        minLimit: 0, maxLimit: 0,
      },
      {
        axis: PhysicsConstraintAxis.ANGULAR_Z,
        minLimit: -30 * Math.PI / 180, maxLimit: -30 * Math.PI / 180,
        // stiffness: 0,
        // damping: 100
      }
    ],
    this.bScene_
    );

    // console.log("Constraints enabled?", joint);

    // PhysicsConstraintAxisLimitMode
    
    bParent.physicsBody.addConstraint(bChild.physicsBody, joint);

    return joint;
  };

  private hingeAngle_ = (joint: Physics6DoFConstraint): number => {
    
    const currentAngle: number = joint.getAxisMotorTarget(0);
    // joint.executeNativeFunction((world, joint) => {
    //   // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
    //   currentAngle = joint.getHingeAngle();
    // });
    return currentAngle;
  };

 

  private lastTick_ = 0;
  private lastMotorAngles_: [number, number, number, number] = [0, 0, 0, 0];

  // Getting sensor values is async. We store the pending promises in these dictionaries.
  private outstandingDigitalGetValues_: Dict<RobotBinding.OutstandingPromise<boolean>> = {};
  private outstandingAnalogGetValues_: Dict<RobotBinding.OutstandingPromise<number>> = {};

  private latestDigitalValues_: [boolean, boolean, boolean, boolean, boolean, boolean] = [false, false, false, false, false, false];
  private latestAnalogValues_: [number, number, number, number, number, number] = [0, 0, 0, 0, 0, 0];

  private lastPErrs_: [number, number, number, number] = [0, 0, 0, 0];
  private iErrs_: [number, number, number, number] = [0, 0, 0, 0];

  private brakeAt_: [number, number, number, number] = [undefined, undefined, undefined, undefined];

  private positionDeltaFracs_: [number, number, number, number] = [0, 0, 0, 0];
  private lastServoEnabledAngle_: [number, number, number, number] = [0, 0, 0, 0];

  

  tick(readable: AbstractRobot.Readable): RobotBinding.TickOut {
    const motorPositionDeltas: [number, number, number, number] = [0, 0, 0, 0];

    const writeCommands: WriteCommand[] = [];

    const now = performance.now();
    const delta = (now - this.lastTick_) / 1000;
    this.lastTick_ = now;


    

    const abstractMotors: [Motor, Motor, Motor, Motor] = [
      readable.getMotor(0),
      readable.getMotor(1),
      readable.getMotor(2),
      readable.getMotor(3)
    ];

    // Update motor position deltas
    const nextPositions: [number, number, number, number] = [0, 0, 0, 0];
    for (let port = 0; port < 4; ++port) {
      const motorId = this.motorPorts_[port];
      
      // If no motor is bound to the port, skip it.
      if (!motorId) continue;

      const abstractMotor = abstractMotors[port];
    
      const motorNode = this.robot_.nodes[motorId] as Node.Motor;
      const bMotor = this.motors_[motorId];
      const ticksPerRevolution = motorNode.ticksPerRevolution ?? 2048;

      const plug = (motorNode.plug === undefined || motorNode.plug === 'normal') ? 1 : -1;

      // Get the delta angle of the motor since the last tick.
      const currentAngle = this.hingeAngle_(bMotor);
      const lastMotorAngle = this.lastMotorAngles_[port];
      let deltaAngle = 0;
      if (lastMotorAngle > Math.PI / 2 && currentAngle < -Math.PI / 2) {
        deltaAngle = currentAngle + 2 * Math.PI - lastMotorAngle;
      } else if (lastMotorAngle < -Math.PI / 2 && currentAngle > Math.PI / 2) {
        deltaAngle = currentAngle - 2 * Math.PI - lastMotorAngle;
      } else {
        deltaAngle = currentAngle - lastMotorAngle;
      }
      this.lastMotorAngles_[port] = currentAngle;

      const angularVelocity = deltaAngle / delta;

      const {
        position,
        kP,
        kD,
        kI,
        direction
      } = abstractMotor;
      let { pwm, mode, positionGoal, speedGoal, done } = abstractMotor;

      // Convert to ticks
      const positionDeltaRaw = plug * deltaAngle / (2 * Math.PI) * ticksPerRevolution + this.positionDeltaFracs_[port];



      const positionDelta = Math.trunc(positionDeltaRaw);
      this.positionDeltaFracs_[port] = positionDeltaRaw - positionDelta;


      const velocity = plug * angularVelocity / (2 * Math.PI) * ticksPerRevolution;

      nextPositions[port] = position + positionDelta;

      writeCommands.push(WriteCommand.addMotorPosition({ port, positionDelta }));

      

      let writePwm = true;

      if (mode === Motor.Mode.Pwm && direction === Motor.Direction.Idle) {
        bMotor.setAxisMotorTarget(PhysicsConstraintAxis.ANGULAR_Z, 0);
        continue;
      }

      if (mode === Motor.Mode.Pwm && direction === Motor.Direction.Brake) {
        if (this.brakeAt_[port] === undefined) {
          this.brakeAt_[port] = position;
          this.lastPErrs_[port] = 0;
          this.iErrs_[port] = 0;
        }

        done = false;

        if (this.brakeAt_[port] === position) {
          mode = Motor.Mode.Pwm;
          pwm = 0;
        } else {
          mode = Motor.Mode.SpeedPosition;
          positionGoal = this.brakeAt_[port];
          speedGoal = position > positionGoal ? -2 : 2;
        }

        writePwm = false;
      } else {
        this.brakeAt_[port] = undefined;
      }

      const velocityMax = motorNode.velocityMax || 1500;

      if (mode !== Motor.Mode.Pwm && !done) {
        // This code is taken from Wombat-Firmware for parity.
        const pErr = speedGoal - velocity;
        const dErr = pErr - this.lastPErrs_[port];
        this.lastPErrs_[port] = pErr;

        const iErr = clamp(-10000, this.iErrs_[port] + pErr, 10000);
        this.iErrs_[port] = iErr;

        pwm = speedGoal / velocityMax * 400;
        pwm = pwm + kP * pErr + kI * iErr + kD * dErr;

        if (mode === Motor.Mode.Position || mode === Motor.Mode.SpeedPosition) {
          if (speedGoal < 0 && position < positionGoal) {
            pwm = 0;
            writeCommands.push(WriteCommand.motorDone({ port, done: true }));
          } else if (speedGoal > 0 && position > positionGoal) {
            pwm = 0;
            writeCommands.push(WriteCommand.motorDone({ port, done: true }));
          }
        }
      } else {
        this.lastPErrs_[port] = 0;
        this.iErrs_[port] = 0;
      }

      pwm = plug * clamp(-400, pwm, 400);

      if (writePwm) writeCommands.push(WriteCommand.motorPwm({ port, pwm }));
      
      const normalizedPwm = pwm / 400;
      const nextAngularVelocity = normalizedPwm * velocityMax * 2 * Math.PI / ticksPerRevolution;

      const currentTarget = bMotor.getAxisMotorTarget(PhysicsConstraintAxis.ANGULAR_Z);

      if (currentTarget.toFixed(5) !== nextAngularVelocity.toFixed(5)) {
        console.log(`Setting motor ${motorId} to ${nextAngularVelocity} from (${currentTarget})`);
        bMotor.setAxisMotorTarget(PhysicsConstraintAxis.ANGULAR_Z, nextAngularVelocity);
      }
    }


    // Servos
    for (let i = 0; i < 4; i++) {
      const servoId = this.servoPorts_[i];

      // If no servo is bound to the port, skip it.
      if (!servoId) continue;

      const servo = this.robot_.nodes[servoId];
      if (!servo) throw new Error(`Missing servo: ${servoId}`);
      if (servo.type !== Node.Type.Servo) throw new Error(`Invalid servo type: ${servo.type}`);

      const bServo = this.servos_[servoId];
      if (!bServo) throw new Error(`Missing motor instantiation: "${servoId}" on port ${i}`);

      const abstractServo = readable.getServo(i);

      const position = servo.position ?? {};

      const physicalMin = position.min ?? RobotBinding.SERVO_LOGICAL_MIN_ANGLE;
      const physicalMax = position.max ?? RobotBinding.SERVO_LOGICAL_MAX_ANGLE;

      const twist = Angle.toRadiansValue(servo.childTwist || Angle.degrees(0));

      const physicalMinRads = Angle.toRadiansValue(physicalMin) + twist;
      const physicalMaxRads = Angle.toRadiansValue(physicalMax) + twist;

      if (abstractServo.enabled) {
        const servoPosition = clamp(0, abstractServo.position, 2048);
        const desiredAngle = (servoPosition - 1024) / 2048 * RobotBinding.SERVO_LOGICAL_RANGE_RADS;
        if (servoId.includes("claw")) {
          this.lastServoEnabledAngle_[i] = -desiredAngle + twist;

        } else {
          this.lastServoEnabledAngle_[i] = -1 * (-desiredAngle + twist);

        }
      }

   
      const angle = this.lastServoEnabledAngle_[i];

      let cur_angle = 0;
      const cur_direction = bServo.getAxisMotorTarget(PhysicsConstraintAxis.ANGULAR_Z) > 0;
      if (cur_direction) {
        cur_angle = bServo.getAxisMaxLimit(PhysicsConstraintAxis.ANGULAR_Z);
      } else {
        cur_angle = bServo.getAxisMinLimit(PhysicsConstraintAxis.ANGULAR_Z);
      }

      if (cur_angle.toFixed(5) !== angle.toFixed(5)) {
        console.log(`Setting motor ${servoId} to ${angle * 180 / Math.PI} from (${cur_angle * 180 / Math.PI})`);
        if (cur_angle < angle) {
          bServo.setAxisMaxLimit(PhysicsConstraintAxis.ANGULAR_Z, angle); 
          bServo.setAxisMotorTarget(PhysicsConstraintAxis.ANGULAR_Z, Math.PI * .2);
        }
        if (cur_angle > angle) {
          bServo.setAxisMinLimit(PhysicsConstraintAxis.ANGULAR_Z, angle);
          bServo.setAxisMotorTarget(PhysicsConstraintAxis.ANGULAR_Z, Math.PI * -.2);
        }
      }
    }

    // Digital Sensors
    const digitalValues: AbstractRobot.Stateless.DigitalValues = [false, false, false, false, false, false];
    for (let i = 0; i < 6; ++i) {
      const digitalId = this.digitalPorts_[i];
      if (!digitalId) continue;

      const digital = this.digitalSensors_[digitalId];
      if (!digital) throw new Error(`Missing digital sensor: ${digitalId}`);

      const outstanding = this.outstandingDigitalGetValues_[digitalId];
      if (!outstanding) {
        this.outstandingDigitalGetValues_[digitalId] = RobotBinding.OutstandingPromise.create(digital.getValue());
      } else {
        if (RobotBinding.OutstandingPromise.isDone(outstanding)) {
          this.latestDigitalValues_[i] = RobotBinding.OutstandingPromise.value(outstanding);
          this.outstandingDigitalGetValues_[digitalId] = RobotBinding.OutstandingPromise.create(digital.getValue());
        }
      }

      digitalValues[i] = this.latestDigitalValues_[i];
      writeCommands.push(WriteCommand.digitalIn({ port: i, value: digitalValues[i] }));
    }

    const analogValues: AbstractRobot.Stateless.AnalogValues = [0, 0, 0, 0, 0, 0];
    for (let i = 0; i < 6; ++i) {
      const analogId = this.analogPorts_[i];
      if (!analogId) continue;

      const analog = this.analogSensors_[analogId];
      if (!analog) throw new Error(`Missing analog sensor: ${analogId}`);

      const outstanding = this.outstandingAnalogGetValues_[analogId];
      if (!outstanding) {
        this.outstandingAnalogGetValues_[analogId] = RobotBinding.OutstandingPromise.create(analog.getValue());
      } else {
        if (RobotBinding.OutstandingPromise.isDone(outstanding)) {
          this.latestAnalogValues_[i] = RobotBinding.OutstandingPromise.value(outstanding);
          this.outstandingAnalogGetValues_[analogId] = RobotBinding.OutstandingPromise.create(analog.getValue());
        }
      }

      analogValues[i] = this.latestAnalogValues_[i];
      writeCommands.push(WriteCommand.analog({ port: i, value: analogValues[i] }));
    }

    return {
      origin: this.origin,
      writeCommands
    };
  }

  get linkOrigins(): Dict<ReferenceFrame> {
    const linkOrigins: Dict<ReferenceFrame> = {};
    for (const [linkId, link] of Object.entries(this.links_)) {
      const rawLinkPosition = RawVector3.fromBabylon(link.position);
      const rawLinkOrientation = Quaternion.fromBabylon(link.rotationQuaternion);
      const rawLinkScale = RawVector3.fromBabylon(link.scaling);

      linkOrigins[linkId] = {
        position: Vector3.fromRaw(rawLinkPosition, RENDER_SCALE),
        orientation: Rotation.Euler.fromRaw(Euler.fromQuaternion(rawLinkOrientation)),
        scale: rawLinkScale
      };
    }
    return linkOrigins;
  }

  set linkOrigins(newLinkOrigins: Dict<ReferenceFrame>) {
    console.log("SET LINK POSITIONS HERE", newLinkOrigins);
    for (const [linkId, link] of Object.entries(this.links_)) {
      // console.log("Link Positions:111", linkId, link);
      if (!(linkId in newLinkOrigins)) continue;
      const rawLinkPosition = ReferenceFrame.toRaw(newLinkOrigins[linkId], RENDER_SCALE);
      link.position = RawVector3.toBabylon(rawLinkPosition.position);
      link.rotationQuaternion = Quaternion.toBabylon(rawLinkPosition.orientation);
      link.scaling = RawVector3.toBabylon(rawLinkPosition.scale);
      console.log("Link Positions:222", linkId, link.position.y);
    }
  }

  get origin(): ReferenceFrame {
    const rootLink = this.links_[this.rootId_];
    // console.log("Root origin:", rootLink.position);
    const rawOrientation = rootLink.rotationQuaternion;
    const rawInternalOrigin = ReferenceFrame.toRaw(this.robot_.origin || ReferenceFrame.IDENTITY, RENDER_SCALE);

    const orientation = Quaternion.toBabylon(rawOrientation || Quaternion.IDENTITY).multiply(
      Quaternion.toBabylon(rawInternalOrigin.orientation || Quaternion.IDENTITY).invert()
    );

    return {
      position: Vector3.fromRaw(RawVector3.fromBabylon(rootLink.position), RENDER_SCALE),
      orientation: Rotation.Euler.fromRaw(Euler.fromQuaternion(orientation)),
      scale: RawVector3.divideScalar(RawVector3.fromBabylon(rootLink.scaling), RENDER_SCALE_METERS_MULTIPLIER),
    };
  }

  set origin(newOrigin: ReferenceFrame) {

    // console.log("Internal robot newOrigin, original:", newOrigin.position.y, this.origin.position.y);
    this.lastPErrs_ = [0, 0, 0, 0];
    this.iErrs_ = [0, 0, 0, 0];
    this.brakeAt_ = [undefined, undefined, undefined, undefined];

    const rawOrigin = ReferenceFrame.toRaw(newOrigin, RENDER_SCALE);
    const rawInternalOrigin = ReferenceFrame.toRaw(this.robot_.origin || ReferenceFrame.IDENTITY, RENDER_SCALE);
    // console.log("Internal robot origin2:", rawOrigin.position.y);
    // console.log("rawInternalOrigin:", rawInternalOrigin.position);

    const rootLink = this.links_[this.rootId_];

    const rootTransformNode = new BabylonTransformNode('root-transform-node', this.bScene_);
    rootTransformNode.position = rootLink.absolutePosition;
    rootTransformNode.rotationQuaternion = rootLink.absoluteRotationQuaternion;

    // rootTransformNode.position.y = 100;

    for (const link of Object.values(this.links_)) {
      link.physicsBody.disablePreStep = false;
      link.setParent(rootTransformNode);
      link.physicsBody.setAngularVelocity(BabylonVector3.Zero());
      link.physicsBody.setLinearVelocity(BabylonVector3.Zero());
    }

    for (const weight of Object.values(this.weights_)) {
      weight.physicsBody.disablePreStep = false;
      weight.setParent(rootTransformNode);
      weight.physicsBody.setAngularVelocity(BabylonVector3.Zero());
      weight.physicsBody.setLinearVelocity(BabylonVector3.Zero());
    }
    // rootTransformNode.position.y = 200;

    rootTransformNode.position = RawVector3.toBabylon(rawOrigin.position || RawVector3.ZERO)
      .add(RawVector3.toBabylon(rawInternalOrigin.position || RawVector3.ZERO));
    rootTransformNode.rotationQuaternion = Quaternion.toBabylon(rawInternalOrigin.orientation || Quaternion.IDENTITY)
      .multiply(Quaternion.toBabylon(rawOrigin.orientation || Quaternion.IDENTITY));

    // console.log("Internal robot origin4:", rootTransformNode.position.y);
    // this.origin.position = newOrigin.position;



    for (const link of Object.values(this.links_)) {
      // link.position.y += 50;
      link.setParent(null);
    }

    for (const weight of Object.values(this.weights_)) {
      // weight.position.y += 5;
      weight.setParent(null);
    }

    rootTransformNode.dispose();
  }

  get visible(): boolean {
    return this.links_[this.rootId_].visibility === 1;
  }

  set visible(visible: boolean) {
    const visibility = visible ? 1 : 0;
    for (const link of Object.values(this.links_)) {
      link.visibility = visibility;
    }
    for (const analogSensor of Object.values(this.analogSensors_)) {
      analogSensor.visible = visible;
    }
    for (const digitalSensor of Object.values(this.digitalSensors_)) {
      digitalSensor.visible = visible;
    }
  }

  async setRobot(sceneRobot: SceneNode.Robot, robot: Robot, robotSceneId: string) {
    if (this.robot_) throw new Error('Robot already set');
    this.robotSceneId_ = robotSceneId;
    robot.origin = sceneRobot.origin;
    // console.log("THIS IS THE ROBOT", robot);
    // console.log("THIS IS THE SCENE ROBOT", sceneRobot);
    this.robot_ = robot;

    const rootIds = Robot.rootNodeIds(robot);
    if (rootIds.length !== 1) throw new Error('Only one root node is supported');
    
    this.rootId_ = rootIds[0];

    const nodeIds = Robot.breadthFirstNodeIds(robot);
    this.childrenNodeIds_ = Robot.childrenNodeIds(robot);

    const rootNode = robot.nodes[this.rootId_];
    console.log("Root node:", rootNode);


    if (robot.nodes[this.rootId_].type !== Node.Type.Link) throw new Error('Root node must be a link');


    for (const nodeId of nodeIds) {
      const node = robot.nodes[nodeId];
      if (node.type !== Node.Type.Link) continue;

      const bNode = await this.createLink_(nodeId, node);
      bNode.metadata = { id: this.robotSceneId_, selected: false } as SceneMeshMetadata;
      this.links_[nodeId] = bNode;
    }
    console.log("Links:", this.links_);

    for (const nodeId of nodeIds) {
      const node = robot.nodes[nodeId];
      if (node.type === Node.Type.Link) continue;
    
      switch (node.type) {
        case Node.Type.Weight: {
          const bNode = this.createWeight_(nodeId, node);
          this.weights_[nodeId] = bNode;
          break;
        }
        case Node.Type.Motor: {
          // private createHinge_ = (id: string, hinge: Node.HingeJoint & { parentId: string }) => {
          // console.log(`Creating hinge:`, nodeId, node);
          // const { bParent, bChild } = this.bParentChild_(nodeId, node.parentId);
          // bChild.setParent(bParent);
          
          // const childAxis = node.childAxis || node.parentAxis;
          // const bChildAxis = RawVector3.toBabylon(childAxis);
      
          // if (node.childTwist) {
          //   bChild.rotationQuaternion = BabylonQuaternion.RotationAxis(bChildAxis, Angle.toRadiansValue(node.childTwist));
          //   bChild.computeWorldMatrix(true);
          // }
          
          // bChild.setAbsolutePosition(Vector3.toBabylon(node.parentPivot, RENDER_SCALE));
          // bChild.setDirection(Vector3.toBabylon(node.childPivot, RENDER_SCALE));
          // bChild.setPivotPoint(Vector3.toBabylon(node.parentPivot, RENDER_SCALE));
          const bJoint = this.createHinge_(nodeId, node);
          bJoint.setAxisMaxLimit(PhysicsConstraintAxis.ANGULAR_Z, (100000000) * Math.PI); 
          bJoint.setAxisMinLimit(PhysicsConstraintAxis.ANGULAR_Z, (-100000000) * Math.PI);
          bJoint.setAxisMotorType(PhysicsConstraintAxis.ANGULAR_Z, PhysicsConstraintMotorType.VELOCITY); // Position control
          bJoint.setAxisMotorMaxForce(PhysicsConstraintAxis.ANGULAR_Z, 10000); 
          bJoint.setAxisMotorTarget(PhysicsConstraintAxis.ANGULAR_Z, 0);
          this.motors_[nodeId] = bJoint;
          this.motorPorts_[node.motorPort] = nodeId;
          break;
        }
        case Node.Type.Servo: {
          const bJoint = this.createHinge_(nodeId, node); // right spots at least
          //   minLimit: -30 * Math.PI / 180, maxLimit: -30 * Math.PI / 180,
          // -90 is upright and closed; 0 is forward and open
          bJoint.setAxisMaxLimit(PhysicsConstraintAxis.ANGULAR_Z, Angle.toRadiansValue(Angle.degrees(0))); 
          bJoint.setAxisMinLimit(PhysicsConstraintAxis.ANGULAR_Z, Angle.toRadiansValue(Angle.degrees(-90)));
          bJoint.setAxisMotorType(PhysicsConstraintAxis.ANGULAR_Z, PhysicsConstraintMotorType.VELOCITY); // Velocity control
          bJoint.setAxisMotorMaxForce(PhysicsConstraintAxis.ANGULAR_Z, 1000); 
          bJoint.setAxisMotorTarget(PhysicsConstraintAxis.ANGULAR_Z, 0);
          this.servos_[nodeId] = bJoint;
          this.servoPorts_[node.servoPort] = nodeId;
          this.lastServoEnabledAngle_[node.servoPort] = Angle.toRadiansValue(Angle.degrees(-90));
          break;
        }
        case Node.Type.TouchSensor: {
          const sensorObject = this.createTouchSensor_(nodeId, node);
          this.digitalSensors_[nodeId] = sensorObject;
          this.digitalPorts_[node.digitalPort] = nodeId;
          break;
        }
        case Node.Type.EtSensor: {
          const sensorObject = this.createEtSensor_(nodeId, node);
          this.analogSensors_[nodeId] = sensorObject;
          this.analogPorts_[node.analogPort] = nodeId;
          break;
        }
        case Node.Type.LightSensor: {
          const sensorObject = this.createLightSensor_(nodeId, node);
          this.analogSensors_[nodeId] = sensorObject;
          this.analogPorts_[node.analogPort] = nodeId;
          break;
        }
        case Node.Type.ReflectanceSensor: {
          const sensorObject = this.createReflectanceSensor_(nodeId, node);
          this.analogSensors_[nodeId] = sensorObject;
          this.analogPorts_[node.analogPort] = nodeId;
          break;
        }
      }
    }
  }

  dispose() {
    for (const link of Object.values(this.links_)) link.dispose();
    this.links_ = {};

    for (const weight of Object.values(this.weights_)) weight.dispose();
    this.weights_ = {};

    this.motors_ = {};
    this.servos_ = {};

    for (const digitalSensor of Object.values(this.digitalSensors_)) digitalSensor.dispose();
    this.digitalSensors_ = {};

    for (const analogSensor of Object.values(this.analogSensors_)) analogSensor.dispose();
    this.analogSensors_ = {};

    this.robot_ = null;
  }

  set realisticSensors(realisticSensors: boolean) {
    for (const digitalSensor of Object.values(this.digitalSensors_)) {
      digitalSensor.realistic = realisticSensors;
    }
    for (const analogSensor of Object.values(this.analogSensors_)) {
      analogSensor.realistic = realisticSensors;
    }
  }

  set noisySensors(noisySensors: boolean) {
    for (const digitalSensor of Object.values(this.digitalSensors_)) {
      digitalSensor.noisy = noisySensors;
    }
    for (const analogSensor of Object.values(this.analogSensors_)) {
      analogSensor.noisy = noisySensors;
    }
  }
}

namespace RobotBinding {
  export interface TickOut {
    /**
     * The new origin of the robot
     */
    origin: ReferenceFrame;

    writeCommands: WriteCommand[];
  }

  export namespace TickOut {
    export const NIL: TickOut = {
      origin: ReferenceFrame.IDENTITY,
      writeCommands: [],
    };
  }

  export interface OutstandingPromise<T> {
    // Done needs to be wrapped in an object so we can access by reference.
    doneObj: { done: boolean; };
    valueObj: { value: T };
  }

  export namespace OutstandingPromise {
    export const create = <T>(promise: Promise<T>): OutstandingPromise<T> => {
      const doneObj = { done: false };
      const valueObj = { value: undefined };
      void promise.then(v => {
        valueObj.value = v;
        doneObj.done = true;
      });
      return { doneObj, valueObj };
    };

    export const isDone = <T>(promise: OutstandingPromise<T>): boolean => promise.doneObj.done;
    export const value = <T>(promise: OutstandingPromise<T>): T => promise.valueObj.value;
  }

  export interface Sensor<T> {
    getValue(): Promise<T>;
    dispose(): void;

    realistic: boolean;
    noisy: boolean;
    visible: boolean;
  }

  export interface SensorParameters<T> {
    id: string;
    definition: T;
    parent: BabylonMesh;
    scene: BabylonScene;
    links: Set<BabylonMesh>;
    colliders: Set<BabylonIPhysicsEnabledObject>;
  }

  export abstract class SensorObject<T, O> implements Sensor<O> {
    private parameters_: SensorParameters<T>;
    get parameters() { return this.parameters_; }

    private realistic_ = false;
    get realistic() { return this.realistic_; }
    set realistic(realistic: boolean) { this.realistic_ = realistic; }

    private visible_ = false;
    get visible() { return this.visible_; }
    set visible(visible: boolean) { this.visible_ = visible; }

    private noisy_ = false;
    get noisy() { return this.noisy_; }
    set noisy(noisy: boolean) { this.noisy_ = noisy; }

    constructor(parameters: SensorParameters<T>) {
      this.parameters_ = parameters;
    }

    abstract getValue(): Promise<O>;

    abstract dispose(): void;
  }

  export class TouchSensor extends SensorObject<Node.TouchSensor, boolean> {
    private intersector_: BabylonMesh;
    
    constructor(parameters: SensorParameters<Node.TouchSensor>) {
      super(parameters);

      const { id, definition, parent, scene } = parameters;
      const { collisionBox, origin } = definition;

      // The parent already has RENDER_SCALE applied, so we don't need to apply it again.
      const rawCollisionBox = Vector3.toRaw(collisionBox, 'meters');

      this.intersector_ = BabylonBoxBuilder.CreateBox(id, {
        depth: rawCollisionBox.z,
        height: rawCollisionBox.y,
        width: rawCollisionBox.x,
      }, scene);

      this.intersector_.parent = parent;
      this.intersector_.material = new BabylonStandardMaterial('touch-sensor-material', scene);
      this.intersector_.material.wireframe = true;
      this.intersector_.visibility = 0;

      ReferenceFrame.syncBabylon(origin, this.intersector_, 'meters');
    }

    override getValue(): Promise<boolean> {
      const { scene, links } = this.parameters;

      const meshes = scene.getActiveMeshes();

      let hit = false;
      meshes.forEach(mesh => {
        if (hit || mesh === this.intersector_ || links.has(mesh as BabylonMesh)) return;
        if (!mesh.physicsBody) return;
        hit = this.intersector_.intersectsMesh(mesh, true);
      });

      return Promise.resolve(hit);
    }

    override dispose(): void {
      this.intersector_.dispose();
    }
  }

  export class EtSensor extends SensorObject<Node.EtSensor, number> {
    private trace_: BabylonLinesMesh;

    private static readonly DEFAULT_MAX_DISTANCE = Distance.centimeters(100);
    private static readonly DEFAULT_NOISE_RADIUS = Distance.centimeters(160);
    private static readonly FORWARD: BabylonVector3 = new BabylonVector3(0, 0, 1);

    constructor(parameters: SensorParameters<Node.EtSensor>) {
      super(parameters);

      const { id, scene, definition, parent } = parameters;
      const { origin, maxDistance } = definition;

      // The trace will be parented to a link that is already scaled, so we don't need to apply
      // RENDER_SCALE again.

      const rawMaxDistance = Distance.toMetersValue(maxDistance ?? EtSensor.DEFAULT_MAX_DISTANCE);
      
      this.trace_ = BabylonCreateLines(id, {
        points: [
          BabylonVector3.Zero(),
          EtSensor.FORWARD.multiplyByFloats(rawMaxDistance, rawMaxDistance, rawMaxDistance)
        ],
      }, scene);
      this.trace_.visibility = 0;

      ReferenceFrame.syncBabylon(origin, this.trace_, 'meters');
      this.trace_.parent = parent;
    }

    override getValue(): Promise<number> {
      const { scene, definition, links, colliders } = this.parameters;
      const { maxDistance, noiseRadius } = definition;

      const rawMaxDistance = Distance.toValue(maxDistance || EtSensor.DEFAULT_MAX_DISTANCE, RENDER_SCALE);
      this.trace_.visibility = this.visible ? 1 : 0;

      const ray = new BabylonRay(
        this.trace_.absolutePosition,
        EtSensor.FORWARD.applyRotationQuaternion(this.trace_.absoluteRotationQuaternion),
        rawMaxDistance
      );

      const hit = scene.pickWithRay(ray, mesh => {
        const metadata = mesh.metadata as SceneMeshMetadata;
        return (
          metadata &&
          mesh !== this.trace_ &&
          !links.has(mesh as BabylonMesh) &&
          !colliders.has(mesh as BabylonMesh) &&
          (!!mesh.physicsBody || metadata.selected)
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

  /**
   * A light sensor that detects the amount of light at a given point in space.
   * 
   * This assumes the sensor can receive light from all directions. A ray is cast
   * to every light in the scene. If it collides with a mesh, it is considered
   * blocked. Otherwise, the light is considered to be received.
   * 
   * The sensor value is the sum of the light intensities of all lights that are
   * not blocked, normalized to a calibrated value from measurements on a Wombat.
   */
  export class LightSensor extends SensorObject<Node.LightSensor, number> {
    private trace_: BabylonAbstractMesh;
    private rayTrace_: BabylonLinesMesh;

    // Calibrated value from real sensor with overhead light on
    private static AMBIENT_LIGHT_VALUE = 4095 - 3645;

    private static DEFAULT_NOISE_RADIUS = 10;

    private static lightValue_ = (distance: Distance) => {
      const cm = Distance.toCentimetersValue(distance);
      if (cm < 0) return 0;
      return 4095 - 19.4 + -0.678 * cm + 0.058 * cm * cm + -5.89e-04 * cm * cm * cm;
    };

    constructor(parameters: SensorParameters<Node.LightSensor>) {
      super(parameters);

      const { id, scene, definition, parent } = parameters;
      const { origin } = definition;
      

      this.trace_ = BabylonIcoSphereBuilder.CreateIcoSphere(`${id}-light-sensor-trace`, {
        radius: 0.01,
        subdivisions: 1,
      });

      this.trace_.material = new BabylonStandardMaterial(`${id}-light-sensor-trace-material`, scene);
      this.trace_.material.wireframe = true;


      ReferenceFrame.syncBabylon(origin, this.trace_, 'meters');
      this.trace_.parent = parameters.parent;

      this.trace_.visibility = 0;
    }

    intersects(ray: BabylonRay) {
      const { scene } = this.parameters;
      const meshes = scene.getActiveMeshes();

      let hit = false;
      for (let i = 0; i < meshes.length; i++) {
        const mesh = meshes.data[i];
        if (mesh === this.trace_) continue;
        if (!mesh.physicsBody) continue;
        hit = ray.intersectsBox(mesh.getBoundingInfo().boundingBox);
        if (hit) break;
      }

      return hit;
    }

    override getValue(): Promise<number> {
      const { scene } = this.parameters;
      this.trace_.visibility = this.visible ? 1 : 0;

      const position = Vector3.fromRaw(RawVector3.fromBabylon(this.trace_.getAbsolutePosition()), RENDER_SCALE);

      let valueSum = 0;
      for (const light of scene.lights) {
        if (!light.isEnabled(false)) continue;
        if (light instanceof BabylonHemisphericLight) {
          valueSum += light.intensity * LightSensor.AMBIENT_LIGHT_VALUE;
          continue;
        }

        const intensity = light.getScaledIntensity();
        const lightPosition = Vector3.fromRaw(RawVector3.fromBabylon(light.getAbsolutePosition()), RENDER_SCALE);
        const offset = Vector3.subtract(position, lightPosition);
        const distance = Vector3.length(offset);
        const ray = new BabylonRay(
          Vector3.toBabylon(position, RENDER_SCALE),
          Vector3.toBabylon(offset, RENDER_SCALE),
          Distance.toValue(distance, RENDER_SCALE)
        );

        if (this.intersects(ray)) continue;

        // If the light is directional, determine if it is pointing towards the
        // sensor. If not, it is not received.
        if (light instanceof BabylonDirectionalLight) {
          const direction = BabylonVector3.Forward(true)
            .applyRotationQuaternion(BabylonQuaternion.FromEulerVector(light.getRotation()));
          
          const dot = BabylonVector3.Dot(direction, Vector3.toBabylon(offset, RENDER_SCALE));
          const angle = Math.acos(dot / Distance.toValue(Vector3.length(offset), RENDER_SCALE));

          if (angle > Math.PI / 2) continue;
        }

        // Similar for spot light
        if (light instanceof BabylonSpotLight) {
          const direction = BabylonVector3.Forward(true)
            .applyRotationQuaternion(BabylonQuaternion.FromEulerVector(light.getRotation()));
          
          const dot = BabylonVector3.Dot(direction, Vector3.toBabylon(offset, RENDER_SCALE));
          const angle = Math.acos(dot / Distance.toValue(Vector3.length(offset), RENDER_SCALE));

          if (angle > light.angle / 2) continue;
        }

        valueSum += intensity * LightSensor.lightValue_(distance);
      }

      if (this.noisy) {
        const offset = Math.floor(LightSensor.DEFAULT_NOISE_RADIUS * Math.random() * 2) - LightSensor.DEFAULT_NOISE_RADIUS;
        valueSum -= offset;
      }

      return Promise.resolve(4095 - clamp(0, valueSum, 4095));
    }

    override dispose(): void {
      this.trace_.dispose();
    }
  }

  export class ReflectanceSensor extends SensorObject<Node.ReflectanceSensor, number> {
    private trace_: BabylonLinesMesh;

    private lastHitTextureId_: string | null = null;
    private lastHitPixels_: ArrayBufferView | null = null;

    private static readonly DEFAULT_MAX_DISTANCE = Distance.centimeters(1.5);
    private static readonly DEFAULT_NOISE_RADIUS = Distance.centimeters(10);
    private static readonly FORWARD: BabylonVector3 = new BabylonVector3(0, 0, 1);

    constructor(parameters: SensorParameters<Node.ReflectanceSensor>) {
      super(parameters);

      const { id, scene, definition, parent } = parameters;
      const { origin, maxDistance } = definition;

      // The trace will be parented to a link that is already scaled, so we don't need to apply
      // RENDER_SCALE again.

      const rawMaxDistance = Distance.toMetersValue(maxDistance ?? ReflectanceSensor.DEFAULT_MAX_DISTANCE);
      this.trace_ = BabylonCreateLines(id, {
        points: [
          BabylonVector3.Zero(),
          ReflectanceSensor.FORWARD.multiplyByFloats(rawMaxDistance, rawMaxDistance, rawMaxDistance)
        ],
      }, scene);
      this.trace_.visibility = 0;

      ReferenceFrame.syncBabylon(origin, this.trace_, 'meters');
      this.trace_.parent = parent;
    }

    override async getValue(): Promise<number> {
      const { scene, definition, links, colliders } = this.parameters;
      const { maxDistance, noiseRadius } = definition;

      const rawMaxDistance = Distance.toValue(maxDistance || ReflectanceSensor.DEFAULT_MAX_DISTANCE, RENDER_SCALE);
      this.trace_.visibility = this.visible ? 1 : 0;

      const ray = new BabylonRay(
        this.trace_.absolutePosition,
        ReflectanceSensor.FORWARD.applyRotationQuaternion(this.trace_.absoluteRotationQuaternion),
        rawMaxDistance
      );

      const hit = scene.pickWithRay(ray, mesh => {
        return mesh !== this.trace_ && !links.has(mesh as BabylonMesh) && !colliders.has(mesh as BabylonMesh);
      });

      if (!hit.pickedMesh || !hit.pickedMesh.material || hit.pickedMesh.material.getActiveTextures().length === 0) return 0;
      
      let sensorValue = 0;
      
      const hitTexture = hit.pickedMesh.material.getActiveTextures()[0];

      // Only reprocess the texture if we hit a different texture than before
      if (this.lastHitTextureId_ === null || this.lastHitTextureId_ !== hitTexture.uid) {
        if (hitTexture.isReady()) {
          this.lastHitTextureId_ = hitTexture.uid;
          this.lastHitPixels_ = await hitTexture.readPixels();
        } else {
          // Texture isn't ready yet, so nothing we can do
          this.lastHitTextureId_ = null;
          this.lastHitPixels_ = null;
        }
      }

      if (this.lastHitPixels_ !== null) {
        const hitTextureCoordinates = hit.getTextureCoordinates();
        const arrayIndex = Math.floor(hitTextureCoordinates.x * (hitTexture.getSize().width - 1)) * 4 + Math.floor(hitTextureCoordinates.y * (hitTexture.getSize().height - 1)) * hitTexture.getSize().width * 4;

        const r = this.lastHitPixels_[arrayIndex] as number;
        const g = this.lastHitPixels_[arrayIndex + 1] as number;
        const b = this.lastHitPixels_[arrayIndex + 2] as number;

        // Crude conversion from RGB to grayscale
        const colorAverage = (r + g + b) / 3;

        // Value is a grayscale percentage of 4095
        sensorValue = Math.floor(4095 * (1 - (colorAverage / 255)));
      }

      if (this.noisy) {
        const noise = Distance.toValue(noiseRadius || ReflectanceSensor.DEFAULT_NOISE_RADIUS, RENDER_SCALE);
        const offset = Math.floor(noise * Math.random() * 2) - noise;
        sensorValue -= offset;
      }

      return clamp(0, sensorValue, 4095);
    }

    override dispose(): void {
      this.trace_.dispose();
    }
  }

  export const SERVO_LOGICAL_MIN_ANGLE = Angle.degrees(-90.0);
  export const SERVO_LOGICAL_MAX_ANGLE = Angle.degrees(90.0);

  export const SERVO_LOGICAL_MIN_ANGLE_RADS = Angle.toRadiansValue(SERVO_LOGICAL_MIN_ANGLE);
  export const SERVO_LOGICAL_MAX_ANGLE_RADS = Angle.toRadiansValue(SERVO_LOGICAL_MAX_ANGLE);

  export const SERVO_LOGICAL_RANGE_RADS = SERVO_LOGICAL_MAX_ANGLE_RADS - SERVO_LOGICAL_MIN_ANGLE_RADS;
}

export default RobotBinding;