import * as Babylon from 'babylonjs';
import 'babylonjs-loaders';
// import Oimo = require('babylonjs/Oimo');

import Dict from './Dict';

import { Quaternion, ReferenceFrame, Vector2, Vector3 } from './math';
import { ReferenceFrame as UnitReferenceFrame, Rotation, Vector3 as UnitVector3 } from './unit-math';
import { RobotPosition } from './RobotPosition';
import { Angle, Distance, Mass } from './util';

import store, { State } from './state';
import { Unsubscribe } from 'redux';
import deepNeq from './deepNeq';
import { SceneAction } from './state/reducer';
import { Gizmo } from 'babylonjs/Gizmos/gizmo';
import SceneBinding, { SceneMeshMetadata } from './SceneBinding';
import Scene from './state/State/Scene';
import Node from './state/State/Scene/Node';
import { Robots } from './state/State';


let Ammo: unknown;
if (SIMULATOR_HAS_AMMO) {
  // This is on a non-standard path specified in the webpack config.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  Ammo = require('ammo.js');
}

import RobotBinding from './RobotBinding';
import WorkerInstance from './WorkerInstance';
import AbstractRobot from './AbstractRobot';


export let ACTIVE_SPACE: Space;



export class Space {
  private static instance: Space;

  private initializationPromise: Promise<void>;

  private engine: Babylon.Engine;
  private workingCanvas: HTMLCanvasElement;
  private bScene_: Babylon.Scene;

  private currentEngineView: Babylon.EngineView;

  private storeSubscription_: Unsubscribe;

  private sceneBinding_: SceneBinding;

  private scene_: Scene;
  get scene() { return this.scene_; }
  
  private debounceUpdate_ = false;
  private sceneSetting_ = false;
  set scene(scene: Scene) {
    this.scene_ = scene;
    if (this.sceneSetting_ || this.debounceUpdate_) return;

    this.sceneSetting_ = true;
    (async () => {
      // Disable physics during scene changes to avoid objects moving before the scene is fully loaded
      this.bScene_.physicsEnabled = false;
      await this.sceneBinding_.setScene(scene, Robots.loaded(store.getState().robots));
      if (this.scene_ !== scene) {
        await this.sceneBinding_.setScene(this.scene_, Robots.loaded(store.getState().robots));
      }
      this.bScene_.physicsEnabled = true;
    })().finally(() => {
      this.sceneSetting_ = false;
    });
  }

  objectScreenPosition(id: string): Vector2 {
    const mesh = this.bScene_.getMeshByID(id) || this.bScene_.getMeshByName(id);
    if (!mesh) return undefined;

    if (this.engine.views.length <= 0) return undefined;

    const position = mesh.getBoundingInfo().boundingBox.centerWorld;

    const coordinates = Babylon.Vector3.Project(
      position,
      Babylon.Matrix.Identity(),
      this.bScene_.getTransformMatrix(),
      this.sceneBinding_.camera.viewport.toGlobal(
        this.engine.getRenderWidth(),
        this.engine.getRenderHeight(),
      ));
    
    // Assuming the first view is the view of interest
    // If we ever use multiple views, this may break
    const { top, left } = this.engine.views[0].target.getBoundingClientRect();

    return {
      x: coordinates.x + left,
      y: coordinates.y + top
    };
  }

  public static getInstance(): Space {
    if (!Space.instance) {
      Space.instance = new Space();
    }

    return Space.instance;
  }

  // TODO: Find a better way to communicate robot state instead of these callbacks
  private constructor() {
    this.workingCanvas = document.createElement('canvas');

    this.engine = new Babylon.Engine(this.workingCanvas, true, { preserveDrawingBuffer: true, stencil: true });
    this.bScene_ = new Babylon.Scene(this.engine);
    this.bScene_.useRightHandedSystem = true;
    

    this.currentEngineView = null;

    ACTIVE_SPACE = this;

    // tell Babylon to load a local Draco decoder
    Babylon.DracoCompression.Configuration = {
      decoder: {
        wasmUrl: '/static/draco_wasm_wrapper_gltf.js',
        wasmBinaryUrl: '/static/draco_decoder_gltf.wasm',
        fallbackUrl: '/static/draco_decoder_gltf.js'
      }
    };
  }

  // Returns a promise that will resolve after the scene is fully initialized and the render loop is running
  public ensureInitialized(): Promise<void> {
    if (this.initializationPromise === undefined) {
      this.initializationPromise = new Promise((resolve, reject) => {
        this.createScene()
          .then(() => {
            this.startRenderLoop();
            resolve();
          })
          .catch((e) => {
            console.error('The simulator meshes failed to load', e);
            reject(e);
          });
      });
    }

    return this.initializationPromise;
  }

  public switchContext(canvas: HTMLCanvasElement): void {
    this.sceneBinding_.canvas = canvas;
  }

  private onPointerTap_ = (eventData: Babylon.PointerInfo, eventState: Babylon.EventState) => {
    if (!eventData.pickInfo.hit) {
      store.dispatch(SceneAction.UNSELECT_ALL);
      return;
    }


    const mesh = eventData.pickInfo.pickedMesh;
    const id = (mesh.metadata as SceneMeshMetadata).id;
    const prevId = store.getState().scene.workingScene.selectedNodeId;
    if (id !== prevId && store.getState().scene.workingScene.nodes[id]?.editable) {
      store.dispatch(SceneAction.selectNode({ id }));
    } else {
      store.dispatch(SceneAction.UNSELECT_ALL);
    }
  };

  private async createScene(): Promise<void> {
    this.bScene_.onPointerObservable.add(this.onPointerTap_, Babylon.PointerEventTypes.POINTERTAP);

    const light = new Babylon.HemisphericLight('light1', new Babylon.Vector3(0, 1, 0), this.bScene_);
    light.intensity = 0.5;
    light.diffuse = new Babylon.Color3(1.0, 1.0, 1.0);

    // At 100x scale, gravity should be -9.8 * 100, but this causes weird jitter behavior
    // Full gravity will be -9.8 * 10
    const gravityVector = new Babylon.Vector3(0, -9.8 * 50, 0);
    
    

    const state = store.getState();
    
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-explicit-any
    const ammo: unknown = await (Ammo as any)();
    
    this.sceneBinding_ = new SceneBinding(this.bScene_, ammo);
    await this.sceneBinding_.setScene(state.scene.workingScene, Robots.loaded(state.robots));
    this.bScene_.getPhysicsEngine().setSubTimeStep(5);

    // (x, z) coordinates of cans around the board
  }

  // Compare Babylon positions with state positions. If they differ significantly, update state
  private updateStore_ = () => {
    const { workingScene } = store.getState().scene;
    const { nodes } = workingScene;

    const robots = Scene.robots(workingScene);

    const robotWorkerInstances = Dict.map(robots, () => WorkerInstance);
    const tickOuts = this.sceneBinding_.tick(robotWorkerInstances);

    const setNodeBatch: Omit<SceneAction.SetNodeBatch, 'type'> = {
      nodeIds: [],
      modifyReferenceScene: false,
    };

    const tickedIds = Dict.keySet(tickOuts);

    for (const robotId in tickOuts) {
      const tickOut = tickOuts[robotId];
      const robot = nodes[robotId] as Node.Robot;

      robotWorkerInstances[robotId].apply(tickOut.writeCommands);

      setNodeBatch.nodeIds.push({
        id: robotId,
        node: {
          ...robot,
          origin: tickOut.origin,
          state: AbstractRobot.toStateless(robotWorkerInstances[robotId]),
        }
      });
    }

    // Check if nodes have moved significant amounts
    for (const nodeId of Dict.keySet(nodes)) {
      const node = nodes[nodeId];
      const bNode = this.bScene_.getNodeByID(nodeId) || this.bScene_.getNodeByName(node.name);

      if (tickedIds.has(nodeId)) continue;

      // The node may still be loading
      if (!bNode) continue;

      const origin = node.origin ?? {};
      const nodeOriginChange = this.getSignificantOriginChange(origin, bNode);
      if (nodeOriginChange.position || nodeOriginChange.orientation || nodeOriginChange.scale) {
        setNodeBatch.nodeIds.push({
          id: nodeId,
          node: {
            ...node,
            origin: {
              ...node.origin,
              ...nodeOriginChange,
            }
          },
        });
      }
    }

    // Update state with significant changes, if needed
    this.debounceUpdate_ = true;
    if (setNodeBatch.nodeIds.length > 0) store.dispatch(SceneAction.setNodeBatch(setNodeBatch));
    this.debounceUpdate_ = false;
  };

  private getSignificantOriginChange(currentOrigin: UnitReferenceFrame, bNode: Babylon.Node): UnitReferenceFrame {
    const change: UnitReferenceFrame = {};

    const position = currentOrigin?.position ?? UnitVector3.zero('meters');
    const rotation = currentOrigin?.orientation ?? Rotation.fromRawQuaternion(Quaternion.IDENTITY, 'euler');

    let bPosition: Babylon.Vector3;
    let bRotation: Babylon.Quaternion;
    if (bNode instanceof Babylon.TransformNode || bNode instanceof Babylon.AbstractMesh) {
      bPosition = bNode.position;
      bRotation = bNode.rotationQuaternion;
    } else if (bNode instanceof Babylon.ShadowLight) {
      bPosition = bNode.position;
      bRotation = Babylon.Quaternion.Identity();
    } else {
      throw new Error(`Unknown node type: ${bNode.constructor.name}`);
    }

    if (bPosition) {
      const bPositionConv = UnitVector3.fromRaw(Vector3.fromBabylon(bPosition), 'centimeters');
      
      // Distance between the two positions in meters
      const distance = UnitVector3.distance(position, bPositionConv);

      // If varies by more than 0.5cm, consider it a change
      if (distance.value > 0.005) {
        change.position = UnitVector3.toTypeGranular(bPositionConv, position.x.type, position.y.type, position.z.type);
      }
    }

    if (bRotation) {
      const bOrientationConv = Rotation.fromRawQuaternion(Quaternion.fromBabylon(bRotation), 'euler');

      // Angle between the two rotations in radians
      const angle = Rotation.angle(rotation, bOrientationConv);
      const radians = Angle.toRadians(angle);
      
      // If varies by more than 0.5deg, consider it a change
      if (radians.value > 0.00872665) {
        change.orientation = Rotation.toType(bOrientationConv, rotation.type);
      }
    }

    return change;
  }
  
  private startRenderLoop(): void {
    this.engine.runRenderLoop(() => {
      // Post updates to the store
      this.updateStore_();

      this.bScene_.render();
    });
  }

  public handleResize(): void {
    this.engine.resize();
  }

  set realisticSensors(realisticSensors: boolean) {
    this.sceneBinding_.realisticSensors = realisticSensors;
  }

  set noisySensors(noisySensors: boolean) {
    this.sceneBinding_.noisySensors = noisySensors;
  }
}
