
import { PhysicsShapeType, IPhysicsCollisionEvent, IPhysicsEnginePluginV2, PhysicsAggregate, 
  TransformNode, AbstractMesh, PhysicsViewer, ShadowGenerator, CreateBox, CreateSphere, CreateCylinder, 
  CreatePlane, Vector4, Vector3, Texture, DynamicTexture, StandardMaterial, GizmoManager, ArcRotateCamera, 
  IShadowLight, PointLight, SpotLight, DirectionalLight, Color3, PBRMaterial, Mesh, SceneLoader, EngineView,
  Scene as babylScene, Node as babylNode, Camera as babylCamera, Material as babylMaterial,
  GlowLayer, Observer, BoundingBox } from '@babylonjs/core';

// eslint-disable-next-line @typescript-eslint/no-duplicate-imports -- Required import for side effects
import '@babylonjs/core/Engines/Extensions/engine.views';
import '@babylonjs/core/Lights/Shadows/shadowGeneratorSceneComponent';

import Dict from "./util/Dict";
import { RawQuaternion, RawVector2, RawVector3 } from "./util/math";
import Scene from "./state/State/Scene";
import Camera from "./state/State/Scene/Camera";
import Geometry from "./state/State/Scene/Geometry";
import Node from "./state/State/Scene/Node";
import Patch from "./util/Patch";

import { ReferenceFramewUnits, RotationwUnits, Vector3wUnits } from "./util/unit-math";
import { Angle, Distance, Mass, SetOps } from "./util";
import { Color } from './state/State/Scene/Color';
import Material from './state/State/Scene/Material';
import { preBuiltGeometries, preBuiltTemplates } from "./node-templates";
import RobotBinding from './RobotBinding';
import Robot from './state/State/Robot';
import AbstractRobot from './AbstractRobot';
import WorkerInstance from "./programming/WorkerInstance";
import LocalizedString from './util/LocalizedString';
import ScriptManager from './ScriptManager';
import { RENDER_SCALE } from './components/Constants/renderConstants';
import { number } from 'prop-types';

export type FrameLike = TransformNode | AbstractMesh;

export interface SceneMeshMetadata {
  id: string;
  selected?: boolean;
}

class SceneBinding {
  private bScene_: babylScene;
  get bScene() { return this.bScene_; }

  private root_: TransformNode;
  get root() { return this.root_; }

  private scene_: Scene;
  get scene() { return this.scene_; }
  set scene(s: Scene) { this.scene_ = s; }

  private nodes_: Dict<babylNode> = {};

  private shadowGenerators_: Dict<ShadowGenerator> = {};
  private physicsViewer_: PhysicsViewer;

  private camera_: babylCamera;

  private engineView_: EngineView;

  private robots_: Dict<Robot>;
  private robotBindings_: Dict<RobotBinding> = {};

  private scriptManager_ = new ScriptManager();
  get scriptManager() { return this.scriptManager_; }

  get camera() { return this.camera_; }

  private canvas_: HTMLCanvasElement;

  get canvas() { return this.canvas_; }

  set canvas(canvas: HTMLCanvasElement) {
    this.canvas_ = canvas;
    const engine = this.bScene_.getEngine();
    if (this.engineView_) engine.unRegisterView(this.engineView_.target);
    this.engineView_ = engine.registerView(this.canvas_);

    this.bScene_.detachControl();
    engine.inputElement = this.canvas_;
    this.camera_.attachControl(this.engineView_.target, true);
    this.bScene_.attachControl();

  }

  /**
   * `declineTicks` is used for a race between initial robot origin setting and tick origin updates.
   * When this is true, the tick() method will exit immediately and return undefined.
   */
  private declineTicks_ = false;
  
  private materialIdIter_ = 0;

  private seed_ = 0;

  constructor(bScene: babylScene, physics: IPhysicsEnginePluginV2) {
    this.bScene_ = bScene;
    this.scene_ = Scene.EMPTY;

    // Gravity is currently set at 5x, which seems to be a sweet spot for realism and joint performance
    const gravityVector = new Vector3(0, -9.8 * 5, 0); // -9.81
    this.bScene_.enablePhysics(gravityVector, physics);

    // The sub time step is incredibly important for physics realism. 1 seems to work well.
    this.bScene_.getPhysicsEngine().setSubTimeStep(1);
    
    // Uncomment this to turn on the physics viewer for objects
    // this.physicsViewer_ = new PhysicsViewer(this.bScene_);

    this.root_ = new TransformNode('__scene_root__', this.bScene_);
    this.gizmoManager_ = new GizmoManager(this.bScene_);

    this.camera_ = this.createNoneCamera_(Camera.NONE);

    // Gizmos are the little arrows that appear when you select an object
    this.gizmoManager_.positionGizmoEnabled = true;
    this.gizmoManager_.gizmos.positionGizmo.scaleRatio = 1.25;
    this.gizmoManager_.rotationGizmoEnabled = true;
    this.gizmoManager_.scaleGizmoEnabled = false;
    this.gizmoManager_.usePointerToAttachGizmos = false;

    this.scriptManager_.onCollisionFiltersChanged = this.onCollisionFiltersChanged_;
    this.scriptManager_.onIntersectionFiltersChanged = this.onIntersectionFiltersChanged_;
  }

  private robotLinkOrigins_: Dict<Dict<ReferenceFramewUnits>> = {};

  set robotLinkOrigins(robotLinkOrigins: Dict<Dict<ReferenceFramewUnits>>) {
    this.robotLinkOrigins_ = robotLinkOrigins;
  }

  get currentRobotLinkOrigins(): Dict<Dict<ReferenceFramewUnits>> {
    // iterate over all robots
    const ret: Dict<Dict<ReferenceFramewUnits>> = {};
    for (const robotId in this.robotBindings_) {
      const robotBinding = this.robotBindings_[robotId];
      ret[robotId] = robotBinding.linkOrigins;
    }
    return ret;
  }

  // apply_ is used to propogate the function f(m) on children of the specified mesh g
  private static apply_ = (g: babylNode, f: (m: AbstractMesh) => void) => {
    if (g instanceof AbstractMesh) {
      f(g);
    } else {
      (g.getChildren(c => c instanceof AbstractMesh) as AbstractMesh[]).forEach(f);
    }
  };

  private random = (max: number, min: number) => {
    let x = Math.sin(this.seed_++) * 10000;
    x = x - Math.floor(x);
    x = ((x - .5) * (max - min)) + ((max + min) / 2);
    return x;
  };

  private buildGeometry_ = async (name: string, geometry: Geometry, faceUvs?: RawVector2[]): Promise<FrameLike> => {
    let ret: FrameLike;
    switch (geometry.type) {
      case 'box': {
        const rect = CreateBox(name, {
          updatable:true, 
          width: Distance.toCentimetersValue(geometry.size.x),
          height: Distance.toCentimetersValue(geometry.size.y),
          depth: Distance.toCentimetersValue(geometry.size.z),
          faceUV: this.buildGeometryFaceUvs_(faceUvs, 12),
        }, this.bScene_);
        const verts = rect.getVerticesData("position");
        ret = rect;
        break;
      }
      case 'sphere': {
        const bFaceUvs = this.buildGeometryFaceUvs_(faceUvs, 2)?.[0];
        const segments = 4;
        const rock = CreateSphere(name, {
          segments: segments, 
          updatable:true, 
          frontUVs: bFaceUvs,
          sideOrientation: bFaceUvs ? Mesh.DOUBLESIDE : undefined,
          diameterX:Distance.toCentimetersValue(geometry.radius) * 2,
          diameterY:Distance.toCentimetersValue(geometry.radius) * 2 * geometry.squash,
          diameterZ:Distance.toCentimetersValue(geometry.radius) * 2 * geometry.stretch,
        }, this.bScene_);
      
        const positions = rock.getVerticesData("position");
        // TODO: Replace with custom rocks from blender
        if (name.includes('Rock')) {
          const skip = [25,26,38,39,51,52,64,65]; 
          for (let i = 14; i < 65; i++) {
            if (skip.includes(i)) { 
              continue;
            } else {
              positions[3 * i] = positions[3 * i] + this.random(geometry.noise, -1 * geometry.noise);
              positions[1 + 3 * i] = positions[1 + 3 * i] + this.random(geometry.noise, -1 * geometry.noise);
              positions[2 + 3 * i] = positions[2 + 3 * i] + this.random(geometry.noise, -1 * geometry.noise);
            }
          }
        }
        rock.updateVerticesData("position", positions);

        ret = rock;
        break;
      }
      case 'cylinder': {
        ret = CreateCylinder(name, {
          height: Distance.toCentimetersValue(geometry.height),
          diameterTop: Distance.toCentimetersValue(geometry.radius) * 2,
          diameterBottom: Distance.toCentimetersValue(geometry.radius) * 2,
          faceUV: this.buildGeometryFaceUvs_(faceUvs, 6),
        }, this.bScene_);
        break;
      }
      case 'cone': {
        ret = CreateCylinder(name, {
          diameterTop: 0,
          height: Distance.toCentimetersValue(geometry.height),
          diameterBottom: Distance.toCentimetersValue(geometry.radius) * 2,
          faceUV: this.buildGeometryFaceUvs_(faceUvs, 6),
        }, this.bScene_);
        break;
      }
      case 'plane': {
        ret = CreatePlane(name, {
          width: Distance.toCentimetersValue(geometry.size.x),
          height: Distance.toCentimetersValue(geometry.size.y),
          frontUVs: this.buildGeometryFaceUvs_(faceUvs, 2)?.[0],
        }, this.bScene_);
        break;
      }
      case 'file': {
        const index = geometry.uri.lastIndexOf('/');
        const fileName = geometry.uri.substring(index + 1);
        const baseName = geometry.uri.substring(0, index + 1);
  
        const res = await SceneLoader.ImportMeshAsync(geometry.include ?? '', baseName, fileName, this.bScene_);
        if (res.meshes.length === 1) return res.meshes[0];
        // const nonColliders: Mesh[] = [];

        ret = new TransformNode(geometry.uri, this.bScene_);
        for (const mesh of res.meshes as Mesh[]) {
          // GLTF importer adds a __root__ mesh (always the first one) that we can ignore 
          if (mesh.name === '__root__') continue;
          // nonColliders.push(mesh);

          mesh.setParent(ret);
        }
        // const mesh = Mesh.MergeMeshes(nonColliders, true, true, undefined, false, true);
        break; 
      }
      default: {
        throw new Error(`Unsupported geometry type: ${geometry.type}`);
      }
    }

    if (ret instanceof AbstractMesh) {
      ret.visibility = 1;
    } else {
      const children = ret.getChildren(c => c instanceof AbstractMesh) as Mesh[];
      const mesh = Mesh.MergeMeshes(children, true, true, undefined, false, true);
      mesh.visibility = 1;
      ret = mesh;
    }

    return ret;
  };

  private buildGeometryFaceUvs_ = (faceUvs: RawVector2[] | undefined, expectedUvs: number): Vector4[] => {
    if (faceUvs?.length !== expectedUvs) {
      return undefined;
    }

    const ret: Vector4[] = [];
    for (let i = 0; i + 1 < faceUvs.length; i += 2) {
      ret.push(new Vector4(faceUvs[i].x, faceUvs[i].y, faceUvs[i + 1].x, faceUvs[i + 1].y));
    }

    return ret;
  };

  private findBNode_ = (id?: string, defaultToRoot?: boolean): babylNode => {
    if (id === undefined && defaultToRoot) return this.root_;
    if (id !== undefined && !(id in this.nodes_)) throw new Error(`${id} doesn't exist`);
    return this.nodes_[id];
  };

  private createMaterial_ = (id: string, material: Material) => {

    let bMaterial: babylMaterial;
    switch (material.type) {
      case 'basic': {
        const basic = new StandardMaterial(id, this.bScene_);
        const { color } = material;

        if (color) {
          switch (color.type) {
            case 'color3': {
              basic.diffuseColor = Color.toBabylon(color.color);
              basic.diffuseTexture = null;
              break;
            }
            case 'texture': {
              if (!color.uri) {
                basic.diffuseColor = new Color3(0.5, 0, 0.5);
              } else {
                if (id.includes('Sky')) {
                  basic.reflectionTexture = new Texture(color.uri, this.bScene_);
                  basic.reflectionTexture.coordinatesMode = Texture.FIXED_EQUIRECTANGULAR_MODE;
                  basic.backFaceCulling = false;
                  basic.disableLighting = true;
                } else if (id === 'Container') {
                  const myDynamicTexture = new DynamicTexture("dynamic texture", 1000, this.bScene_, true);
                  // myDynamicTexture.drawText(material.text, 130, 600, "18px Arial", "white", "gray", true);
                  myDynamicTexture.drawText(color.uri, 130, 600, "18px Arial", "white", "gray", true);
                  basic.diffuseTexture = myDynamicTexture;
                } else {
                  basic.bumpTexture = new Texture(color.uri, this.bScene_, false, false);
                  basic.emissiveTexture = new Texture(color.uri, this.bScene_, false, false);
                  basic.diffuseTexture = new Texture(color.uri, this.bScene_, false, false);
                  basic.diffuseTexture.coordinatesMode = Texture.FIXED_EQUIRECTANGULAR_MODE;
                  basic.backFaceCulling = false;
                }
              }
              break;
            }
          }
        }
        bMaterial = basic;
        break;
      }
      case 'pbr': {
        const pbr = new PBRMaterial(id, this.bScene_);
        const { albedo, ambient, emissive, metalness, reflection } = material;
        if (albedo) {
          switch (albedo.type) {
            case 'color3': {
              pbr.albedoColor = Color.toBabylon(albedo.color);
              break;
            }
            case 'texture': {
              pbr.albedoTexture = new Texture(albedo.uri, this.bScene_);
              break;
            }
          }
        }

        if (ambient) {
          switch (ambient.type) {
            case 'color3': {
              pbr.ambientColor = Color.toBabylon(ambient.color);
              break;
            }
            case 'texture': {
              pbr.ambientTexture = new Texture(ambient.uri, this.bScene_);
              break;
            }
          }
        }

        if (emissive) {
          const glow = new GlowLayer('glow', this.bScene_);
          switch (emissive.type) {
            case 'color3': {
              pbr.emissiveColor = Color.toBabylon(emissive.color);
              break;
            }
            case 'texture': {
              pbr.emissiveTexture = new Texture(emissive.uri, this.bScene_);
              break;
            }
          }
        }
        
        if (metalness) {
          switch (metalness.type) {
            case 'color1': {
              pbr.metallic = metalness.color;
              break;
            }
            case 'texture': {
              pbr.metallicTexture = new Texture(metalness.uri, this.bScene_);
              break;
            }
          }
        }
        
        if (reflection) {
          switch (reflection.type) {
            case 'color3': {
              pbr.reflectivityColor = Color.toBabylon(reflection.color);
              break;
            }
            case 'texture': {
              pbr.reflectivityTexture = new Texture(reflection.uri, this.bScene_);
              break;
            }
          }
        }

        bMaterial = pbr;

        break;
      }
    }

    return bMaterial;
  };

  private updateMaterialBasic_ = (bMaterial: StandardMaterial, material: Patch.InnerPatch<Material.Basic>) => {
    const { color } = material;

    if (color.type === Patch.Type.InnerChange || color.type === Patch.Type.OuterChange) {
      switch (color.next.type) {
        case 'color3': {

          bMaterial.diffuseColor = Color.toBabylon(color.next.color);
          bMaterial.diffuseTexture = null;
          break;
        }
        case 'texture': {
          if (!color.next.uri) {
            bMaterial.diffuseColor = new Color3(0.5, 0, 0.5);
            bMaterial.diffuseTexture = null;
          } else if (color.next.uri[0] !== '/') {
            const myDynamicTexture = new DynamicTexture("dynamic texture", 1000, this.bScene_, true);
            // myDynamicTexture.drawText(material.text, 130, 600, "18px Arial", "white", "gray", true);
            myDynamicTexture.drawText(color.next.uri, 130, 600, "18px Arial", "white", "gray", true);
            bMaterial.diffuseTexture = myDynamicTexture;
          } else {
            bMaterial.diffuseColor = Color.toBabylon(Color.WHITE);
            bMaterial.diffuseTexture = new Texture(color.next.uri, this.bScene_);
          }
          break;
        }
      }
    }

    return bMaterial;
  };

  private updateMaterialPbr_ = (bMaterial: PBRMaterial, material: Patch.InnerPatch<Material.Pbr>) => {
    const { albedo, ambient, emissive, metalness, reflection } = material;

    if (albedo.type === Patch.Type.OuterChange) {
      switch (albedo.next.type) {
        case 'color3': {
          bMaterial.albedoColor = Color.toBabylon(albedo.next.color);
          bMaterial.albedoTexture = null;
          break;
        }
        case 'texture': {
          if (!albedo.next.uri) {
            bMaterial.albedoColor = new Color3(0.5, 0, 0.5);
          } else {
            bMaterial.albedoColor = Color.toBabylon(Color.WHITE);
            bMaterial.albedoTexture = new Texture(albedo.next.uri, this.bScene_);
          }
          break;
        }
      }
    }

    if (ambient.type === Patch.Type.OuterChange) {
      switch (ambient.next.type) {
        case 'color3': {
          bMaterial.ambientColor = Color.toBabylon(ambient.next.color);
          bMaterial.ambientTexture = null;
          break;
        }
        case 'texture': {
          if (!ambient.next.uri) {
            bMaterial.ambientColor = new Color3(0.5, 0, 0.5);
            bMaterial.ambientTexture = null;
          } else {
            bMaterial.ambientColor = Color.toBabylon(Color.WHITE);
            bMaterial.ambientTexture = new Texture(ambient.next.uri, this.bScene_);
          }
          break;
        }
      }
    }

    if (emissive.type === Patch.Type.OuterChange) {
      switch (emissive.next.type) {
        case 'color3': {
          bMaterial.emissiveColor = Color.toBabylon(emissive.next.color);
          bMaterial.emissiveTexture = null;
          break;
        }
        case 'texture': {
          if (!emissive.next.uri) {
            bMaterial.emissiveColor = new Color3(0.5, 0, 0.5);
            bMaterial.emissiveTexture = null;
          } else {
            bMaterial.emissiveColor = Color.toBabylon(Color.BLACK);
            bMaterial.emissiveTexture = new Texture(emissive.next.uri, this.bScene_);
          }
          break;
        }
      }
    }

    if (metalness.type === Patch.Type.OuterChange) {
      switch (metalness.next.type) {
        case 'color1': {
          bMaterial.metallic = metalness.next.color;
          bMaterial.metallicTexture = null;
          break;
        }
        case 'texture': {
          if (!metalness.next.uri) {
            bMaterial.metallic = 0;
          } else {
            bMaterial.metallicTexture = new Texture(metalness.next.uri, this.bScene_);
          }
          break;
        }
      }
    }

    if (reflection.type === Patch.Type.OuterChange) {
      switch (reflection.next.type) {
        case 'color3': {
          bMaterial.reflectivityColor = Color.toBabylon(reflection.next.color);
          bMaterial.reflectivityTexture = null;
          break;
        }
        case 'texture': {
          if (!reflection.next.uri) {
            bMaterial.reflectivityColor = new Color3(0.5, 0, 0.5);
            bMaterial.reflectivityTexture = null;
          } else {
            bMaterial.reflectivityColor = Color.toBabylon(Color.WHITE);
            bMaterial.reflectivityTexture = new Texture(reflection.next.uri, this.bScene_);
          }
          break;
        }
      }
    }
    
    return bMaterial;
  };

  private updateMaterial_ = (bMaterial: babylMaterial, material: Patch<Material>) => {
    switch (material.type) {
      case Patch.Type.OuterChange: {
        const { next } = material;
        const id = bMaterial ? `${bMaterial.id}` : `Scene Material ${this.materialIdIter_++}`;
        if (bMaterial) bMaterial.dispose();
        if (next) {
          return this.createMaterial_(id, next);
        }
        return null;
      }
      case Patch.Type.InnerChange: {
        const { inner, next } = material;
        switch (next.type) {
          case 'basic': {
            return this.updateMaterialBasic_(bMaterial as StandardMaterial, inner as Patch.InnerPatch<Material.Basic>);
          }
          case 'pbr': {
            return this.updateMaterialPbr_(bMaterial as PBRMaterial, inner as Patch.InnerPatch<Material.Pbr>);
          }
        }
        break;
      }
    }

    return bMaterial;
  };

  private createObject_ = async (node: Node.Obj, nextScene: Scene): Promise<babylNode> => {
    const parent = this.findBNode_(node.parentId, true);

    const geometry = nextScene.geometry[node.geometryId] ?? preBuiltGeometries[node.geometryId];
    if (!geometry) {
      console.error(`node ${LocalizedString.lookup(node.name, LocalizedString.EN_US)} has invalid geometry ID: ${node.geometryId}`);
      return null;
    }
    const ret = await this.buildGeometry_(node.name[LocalizedString.EN_US], geometry, node.faceUvs);

    if (!node.visible) {
      SceneBinding.apply_(ret, m => m.isVisible = false);
    }

    if (node.material) {
      const material = this.createMaterial_(node.name[LocalizedString.EN_US], node.material);
      SceneBinding.apply_(ret, m => m.material = material);
    }

    ret.setParent(parent);
    return ret;
  };

  private createEmpty_ = (node: Node.Empty): TransformNode => {
    const parent = this.findBNode_(node.parentId, true);

    const ret = new TransformNode(node.name[LocalizedString.EN_US], this.bScene_);
    ret.setParent(parent);
    return ret;
  };

  private createDirectionalLight_ = (id: string, node: Node.DirectionalLight): DirectionalLight => {
    const ret = new DirectionalLight(node.name[LocalizedString.EN_US], RawVector3.toBabylon(node.direction), this.bScene_);

    ret.intensity = node.intensity;
    if (node.radius !== undefined) ret.radius = node.radius;
    if (node.range !== undefined) ret.range = node.range;

    this.shadowGenerators_[id] = SceneBinding.createShadowGenerator_(ret);

    return ret;
  };

  private createSpotLight_ = (id: string, node: Node.SpotLight): SpotLight => {
    const origin: ReferenceFramewUnits = node.origin ?? {};
    const position: Vector3wUnits = origin.position ?? Vector3wUnits.zero();
    
    const ret = new SpotLight(
      node.name[LocalizedString.EN_US],
      RawVector3.toBabylon(Vector3wUnits.toRaw(position, 'centimeters')),
      RawVector3.toBabylon(node.direction),
      Angle.toRadiansValue(node.angle),
      node.exponent,
      this.bScene_
    );

    this.shadowGenerators_[id] = SceneBinding.createShadowGenerator_(ret);

    return ret;
  };

  private createPointLight_ = (id: string, node: Node.PointLight): PointLight => {
    const origin: ReferenceFramewUnits = node.origin ?? {};
    const position: Vector3wUnits = origin.position ?? Vector3wUnits.zero();

    const ret = new PointLight(
      node.name[LocalizedString.EN_US],
      RawVector3.toBabylon(Vector3wUnits.toRaw(position, 'centimeters')),
      this.bScene_
    );

    ret.intensity = node.intensity;
    
    this.shadowGenerators_[id] = SceneBinding.createShadowGenerator_(ret);

    ret.setEnabled(node.visible);

    return ret;
  };

  // Create Robot Binding
  private createRobot_ = async (id: string, node: Node.Robot): Promise<RobotBinding> => {
    // This should probably be somewhere else, but it ensures this is called during
    // initial instantiation and when a new scene is loaded.
    WorkerInstance.sync(node.state);

    const robotBinding = new RobotBinding(this.bScene_, this.physicsViewer_);
    const robot = this.robots_[node.robotId];
    if (!robot) throw new Error(`Robot by id "${node.robotId}" not found`);
    await robotBinding.setRobot(node, robot, id);
    robotBinding.linkOrigins = this.robotLinkOrigins_[id] || {};
    // console.log('robot linkOrigins', robotBinding.linkOrigins);
    // Here the linkOrigins are all shown as 0,0,0, this may be why the initial kinematics are messed up.

    robotBinding.visible = true;
    const observerObj: { observer: Observer<babylScene> } = { observer: null };
    
    robotBinding.origin = node.origin;
    
    this.declineTicks_ = true;
    observerObj.observer = this.bScene_.onAfterRenderObservable.add((data, state) => {
      const node = this.scene_.nodes[id];
      if (!node) {
        observerObj.observer.unregisterOnNextCall = true;
        this.declineTicks_ = false;
        return;
      }

      const { origin, visible } = node;

      const linkOrigins = this.robotLinkOrigins_[id];
      if (linkOrigins) robotBinding.linkOrigins = linkOrigins;
      
      robotBinding.visible = visible ?? false;
      observerObj.observer.unregisterOnNextCall = true;
      this.declineTicks_ = false;
    });

    this.robotBindings_[id] = robotBinding;

    this.syncCollisionFilters_();

    return robotBinding;
  };

  private static createShadowGenerator_ = (light: IShadowLight) => {
    const ret = new ShadowGenerator(1024, light);
    ret.useKernelBlur = false;
    ret.blurScale = 2;
    ret.filter = ShadowGenerator.FILTER_POISSONSAMPLING;
    return ret;
  };

  private createNode_ = async (id: string, node: Node, nextScene: Scene): Promise<babylNode> => {
    let nodeToCreate: Node = node;

    // Resolve template nodes into non-template nodes by looking up the template by ID
    if (node.type === 'from-jbc-template' || node.type === 'from-rock-template' || node.type === 'from-space-template') {
      const nodeTemplate = preBuiltTemplates[node.templateId];
      if (!nodeTemplate) {
        console.warn('template node has invalid template ID:', node.templateId);
        return null;
      }

      nodeToCreate = {
        ...node,
        ...nodeTemplate,
      };
    }

    for (const scriptId of nodeToCreate.scriptIds || []) this.scriptManager_.bind(scriptId, id);

    let ret: babylNode;
    switch (nodeToCreate.type) {
      case 'object': ret = await this.createObject_(nodeToCreate, nextScene); break;
      case 'empty': ret = this.createEmpty_(nodeToCreate); break;
      case 'directional-light': ret = this.createDirectionalLight_(id, nodeToCreate); break;
      case 'spot-light': ret = this.createSpotLight_(id, nodeToCreate); break;
      case 'point-light': ret = this.createPointLight_(id, nodeToCreate); break;
      case 'robot': await this.createRobot_(id, nodeToCreate); break;
      default: {
        console.warn('invalid node type for create node:', nodeToCreate.type);
        return null;
      }
    }

    if (!ret) return null;
    
    this.updateNodePosition_(nodeToCreate, ret);
    ret.id = id;
    
    ret.metadata = { id } as SceneMeshMetadata;

    if (ret instanceof AbstractMesh || ret instanceof TransformNode) {
      SceneBinding.apply_(ret, m => {
        m.metadata = { id } as SceneMeshMetadata;
        this.restorePhysicsToObject(m, nodeToCreate as Node.Obj, null, nextScene);
      });
    }

    return ret;
  };

  private updateNodePosition_ = (node: Node, bNode: babylNode) => {
    if (node.origin && bNode instanceof TransformNode || bNode instanceof AbstractMesh) {
      const origin = node.origin || {};
      const position: Vector3wUnits = origin.position ?? Vector3wUnits.zero();
      const orientation: RotationwUnits = origin.orientation ?? RotationwUnits.EulerwUnits.identity();
      const scale = origin.scale ?? RawVector3.ONE;

      bNode.position.set(
        Distance.toCentimetersValue(position.x || Distance.centimeters(0)),
        Distance.toCentimetersValue(position.y || Distance.centimeters(0)),
        Distance.toCentimetersValue(position.z || Distance.centimeters(0))
      );

      bNode.rotationQuaternion = RawQuaternion.toBabylon(RotationwUnits.toRawQuaternion(orientation));
      bNode.scaling.set(scale.x, scale.y, scale.z);
    }
  };

  private updateEmpty_ = (id: string, node: Patch.InnerChange<Node.Empty>): TransformNode => {
    const bNode = this.findBNode_(id) as TransformNode;

    if (node.inner.name.type === Patch.Type.OuterChange) {
      bNode.name = node.inner.name.next[LocalizedString.EN_US];
    }

    if (node.inner.parentId.type === Patch.Type.OuterChange) {
      const parent = this.findBNode_(node.inner.parentId.next, true);
      bNode.setParent(parent);
    }

    if (node.inner.origin.type === Patch.Type.OuterChange) {
      this.updateNodePosition_(node.next, bNode);
    }

    return bNode;
  };

  private findMaterial_ = (frameLike: FrameLike) => {
    if (frameLike instanceof AbstractMesh) {
      return frameLike.material;
    }

    const children = frameLike.getChildren(o => o instanceof AbstractMesh);
    if (children && children.length > 0) {
      return (children[0] as AbstractMesh).material;
    }
    
    return null;
  };

  // Patch changes to an object
  private updateObject_ = async (id: string, node: Patch.InnerChange<Node.Obj>, nextScene: Scene): Promise<FrameLike> => {
    const bNode = this.findBNode_(id) as FrameLike;

    // If the object's geometry ID changes, recreate the object entirely
    if (node.inner.geometryId.type === Patch.Type.OuterChange) {
      this.destroyNode_(id);
      return (await this.createNode_(id, node.next, nextScene)) as FrameLike;
    }

    if (node.inner.name.type === Patch.Type.OuterChange) {
      bNode.name = node.inner.name.next[LocalizedString.EN_US];
    }

    if (node.inner.parentId.type === Patch.Type.OuterChange) {
      const parent = this.findBNode_(node.inner.parentId.next, true);
      bNode.setParent(parent);
    }

    let bMaterial = this.findMaterial_(bNode);
    bMaterial = this.updateMaterial_(bMaterial, node.inner.material);
    SceneBinding.apply_(bNode, m => {
      m.material = bMaterial;
    });

    // TODO: Handle changes to faceUvs when we fully support it
    if (node.inner.origin.type === Patch.Type.OuterChange) {
      this.updateNodePosition_(node.next, bNode);
    }

    if (node.inner.physics.type === Patch.Type.OuterChange) {
      SceneBinding.apply_(bNode, m => {
        this.removePhysicsFromObject(m);
        this.restorePhysicsToObject(m, node.next, id, nextScene);
      });
    }

    if (node.inner.visible.type === Patch.Type.OuterChange) {
      const nextVisible = node.inner.visible.next;
      SceneBinding.apply_(bNode, m => {
        m.isVisible = nextVisible;

        // Create/remove physics for object becoming visible/invisible
        if (!nextVisible) {
          this.removePhysicsFromObject(m);
        } else {
          this.restorePhysicsToObject(m, node.next, id, nextScene);
        }
      });
    }
    return Promise.resolve(bNode);
  };

  private updateDirectionalLight_ = (id: string, node: Patch.InnerChange<Node.DirectionalLight>): DirectionalLight => {
    const bNode = this.findBNode_(id) as DirectionalLight;

    // NYI

    return bNode;
  };

  private updateSpotLight_ = (id: string, node: Patch.InnerChange<Node.SpotLight>): SpotLight => {
    const bNode = this.findBNode_(id) as SpotLight;

    // NYI

    return bNode;
  };

  private updatePointLight_ = (id: string, node: Patch.InnerChange<Node.PointLight>): PointLight => {
    const bNode = this.findBNode_(id) as PointLight;

    if (node.inner.visible.type === Patch.Type.OuterChange) {
      bNode.setEnabled(node.inner.visible.next);
    }

    return bNode;
  };

  private updateRobot_ = async (id: string, node: Patch.InnerChange<Node.Robot>): Promise<RobotBinding> => {
    const robotBinding = this.robotBindings_[id];
    if (!robotBinding) throw new Error(`Robot binding not found for id "${id}"`);
    
    if (node.inner.robotId.type === Patch.Type.OuterChange) {
      this.destroyNode_(id);
      return this.createRobot_(id, node.next);
    }

    if (node.inner.origin.type === Patch.Type.OuterChange) {
      robotBinding.origin = node.inner.origin.next;
    }

    if (node.inner.visible.type === Patch.Type.OuterChange) {
      robotBinding.visible = node.inner.visible.next;
    }

    return robotBinding;
  };

  private updateFromTemplate_ = (
    id: string, 
    node: Patch.InnerChange<Node.FromRockTemplate> | Patch.InnerChange<Node.FromSpaceTemplate> | Patch.InnerChange<Node.FromJBCTemplate>, 
    nextScene: Scene
  ): Promise<babylNode> => {
    // If the template ID changes, recreate the node entirely
    if (node.inner.templateId.type === Patch.Type.OuterChange) {
      this.destroyNode_(id);
      return this.createNode_(id, node.next, nextScene);
    }
    const bNode = this.findBNode_(id);

    const nodeTemplate = preBuiltTemplates[node.next.templateId];
    if (!nodeTemplate) {
      console.warn('template node has invalid template ID:', node.next.templateId);
      return Promise.resolve(bNode);
    }

    const prevBaseProps = Node.Base.upcast(node.prev);
    const nextBaseProps = Node.Base.upcast(node.next);

    // Create a Patch for the underlying node type and call its update function
    switch (nodeTemplate.type) {
      case 'empty': {
        const emptyChange: Patch.InnerChange<Node.Empty> = {
          type: Patch.Type.InnerChange,
          prev: { ...nodeTemplate, ...prevBaseProps },
          next: { ...nodeTemplate, ...nextBaseProps },
          inner: {
            ...node.inner,
            type: Patch.none<'empty'>('empty'),
          },
        };
        return Promise.resolve(this.updateEmpty_(id, emptyChange));
      }
      case 'object': {
        const objectChange: Patch.InnerChange<Node.Obj> = {
          type: Patch.Type.InnerChange,
          prev: { ...nodeTemplate, ...prevBaseProps },
          next: { ...nodeTemplate, ...nextBaseProps },
          inner: {
            ...node.inner,
            type: Patch.none<'object'>('object'),
            geometryId: Patch.none(nodeTemplate.geometryId),
            physics: Patch.none(nodeTemplate.physics),
            material: Patch.none(nodeTemplate.material),
            faceUvs: Patch.none(nodeTemplate.faceUvs),
          },
        };
        return this.updateObject_(id, objectChange, nextScene);
      }
      case 'directional-light': {
        const directionalLightChange: Patch.InnerChange<Node.DirectionalLight> = {
          type: Patch.Type.InnerChange,
          prev: { ...nodeTemplate, ...prevBaseProps },
          next: { ...nodeTemplate, ...nextBaseProps },
          inner: {
            ...node.inner,
            type: Patch.none<'directional-light'>('directional-light'),
            radius: Patch.none(nodeTemplate.radius),
            range: Patch.none(nodeTemplate.range),
            direction: Patch.none(nodeTemplate.direction),
            intensity: Patch.none(nodeTemplate.intensity),
          },
        };
        return Promise.resolve(this.updateDirectionalLight_(id, directionalLightChange));
      }
      case 'spot-light': {
        const spotLightChange: Patch.InnerChange<Node.SpotLight> = {
          type: Patch.Type.InnerChange,
          prev: { ...nodeTemplate, ...prevBaseProps },
          next: { ...nodeTemplate, ...nextBaseProps },
          inner: {
            ...node.inner,
            type: Patch.none<'spot-light'>('spot-light'),
            direction: Patch.none(nodeTemplate.direction),
            angle: Patch.none(nodeTemplate.angle),
            exponent: Patch.none(nodeTemplate.exponent),
            intensity: Patch.none(nodeTemplate.intensity),
          },
        };
        return Promise.resolve(this.updateSpotLight_(id, spotLightChange));
      }
      case 'point-light': {
        const pointLightChange: Patch.InnerChange<Node.PointLight> = {
          type: Patch.Type.InnerChange,
          prev: { ...nodeTemplate, ...prevBaseProps },
          next: { ...nodeTemplate, ...nextBaseProps },
          inner: {
            ...node.inner,
            type: Patch.none<'point-light'>('point-light'),
            intensity: Patch.none(nodeTemplate.intensity),
            radius: Patch.none(nodeTemplate.radius),
            range: Patch.none(nodeTemplate.range),
          },
        };
        return Promise.resolve(this.updatePointLight_(id, pointLightChange));
      }
      default: return Promise.resolve(bNode);
    }
  };

  private updateNode_ = async (id: string, node: Patch<Node>, geometryPatches: Dict<Patch<Geometry>>, nextScene: Scene): Promise<babylNode> => {
    
    switch (node.type) {
      // The node hasn't changed type, but some fields have been changed
      case Patch.Type.InnerChange: {
        // If scriptIds changed, rebind the scripts
        if (node.inner.scriptIds.type === Patch.Type.OuterChange) {
          for (const scriptId of node.inner.scriptIds.prev || []) this.scriptManager_.unbind(scriptId, id);
          for (const scriptId of node.inner.scriptIds.next || []) this.scriptManager_.bind(scriptId, id);
        }

        switch (node.next.type) {
          case 'empty': return this.updateEmpty_(id, node as Patch.InnerChange<Node.Empty>);
          case 'object': {
            // If the object's underlying geometry changed, recreate the object entirely
            const geometryPatch = geometryPatches[node.next.geometryId];
            if (geometryPatch.type === Patch.Type.InnerChange || geometryPatch.type === Patch.Type.OuterChange) {
              this.destroyNode_(id);
              return this.createNode_(id, node.prev, nextScene);
            }
            
            return this.updateObject_(id, node as Patch.InnerChange<Node.Obj>, nextScene);
          }
          case 'directional-light': return this.updateDirectionalLight_(id, node as Patch.InnerChange<Node.DirectionalLight>);
          case 'spot-light': return this.updateSpotLight_(id, node as Patch.InnerChange<Node.SpotLight>);
          case 'point-light': return this.updatePointLight_(id, node as Patch.InnerChange<Node.PointLight>);
          case 'robot': {
            await this.updateRobot_(id, node as Patch.InnerChange<Node.Robot>);
            return null;
          }
          case 'from-jbc-template': return this.updateFromTemplate_(id, node as Patch.InnerChange<Node.FromJBCTemplate>, nextScene);
          case 'from-rock-template': return this.updateFromTemplate_(id, node as Patch.InnerChange<Node.FromRockTemplate>, nextScene);
          case 'from-space-template': {
            return this.updateFromTemplate_(id, node as Patch.InnerChange<Node.FromSpaceTemplate>, nextScene);
          }
          default: {
            console.error('invalid node type for inner change:', (node.next as Node).type);
            return this.findBNode_(id);
          }
        }
      }
      // The node has been wholesale replaced by another type of node
      case Patch.Type.OuterChange: {
        this.destroyNode_(id);
        return this.createNode_(id, node.next, nextScene);
      }
      // The node was newly added to the scene
      case Patch.Type.Add: {
        return this.createNode_(id, node.next, nextScene);
      }
      // The node was removed from the scene
      case Patch.Type.Remove: {
        // unbind scripts
        for (const scriptId of node.prev.scriptIds || []) this.scriptManager_.unbind(scriptId, id);
        this.destroyNode_(id);

        return undefined;
      }
      case Patch.Type.None: {
        if (node.prev.type === 'object') {
          // Even though the node is unchanged, if the underlying geometry changed, recreate the object entirely
          const geometryPatch = geometryPatches[node.prev.geometryId];
          if (geometryPatch.type === Patch.Type.InnerChange || geometryPatch.type === Patch.Type.OuterChange) {
            this.destroyNode_(id);
            return this.createNode_(id, node.prev, nextScene);
          }
        }

        if (node.prev.type === 'robot') return null;
        return this.findBNode_(id);
      }
    }
  };

  private destroyNode_ = (id: string) => {
    if (id in this.robotBindings_) {
      this.robotBindings_[id].dispose();
      delete this.robotBindings_[id];
    } else {
      const bNode = this.findBNode_(id);
      bNode.dispose();

      const shadowGenerator = this.shadowGenerators_[id];
      if (shadowGenerator) shadowGenerator.dispose();
    }
  };

  private gizmoManager_: GizmoManager;

  private createArcRotateCamera_ = (camera: Camera.ArcRotate): ArcRotateCamera => {
    const ret = new ArcRotateCamera('botcam', 0, 0, 0, Vector3wUnits.toBabylon(camera.target, 'centimeters'), this.bScene_);
    ret.attachControl(this.bScene_.getEngine().getRenderingCanvas(), true);
    ret.position = Vector3wUnits.toBabylon(camera.position, 'centimeters');
    ret.panningSensibility = 100;
    // ret.checkCollisions = true;

    return ret;
  };

  private createNoneCamera_ = (camera: Camera.None): ArcRotateCamera => {
    const ret = new ArcRotateCamera('botcam', 10, 10, 10, Vector3wUnits.toBabylon(Vector3wUnits.zero(), 'centimeters'), this.bScene_);
    ret.attachControl(this.bScene_.getEngine().getRenderingCanvas(), true);

    return ret;
  };

  private createCamera_ = (camera: Camera): babylCamera => {
    switch (camera.type) {
      case 'arc-rotate': return this.createArcRotateCamera_(camera);
      case 'none': return this.createNoneCamera_(camera);
    }
  };

  private updateArcRotateCamera_ = (node: Patch.InnerChange<Camera.ArcRotate>): ArcRotateCamera => {
    if (!(this.camera_ instanceof ArcRotateCamera)) throw new Error('Expected ArcRotateCamera');

    const bCamera = this.camera_;

    if (node.inner.target.type === Patch.Type.OuterChange) {
      bCamera.setTarget(Vector3wUnits.toBabylon(node.inner.target.next, 'centimeters'));
    }

    if (node.inner.position.type === Patch.Type.OuterChange) {
      bCamera.setPosition(Vector3wUnits.toBabylon(node.inner.position.next, 'centimeters'));
    }

    return bCamera;
  };

  private updateCamera_ = (node: Patch.InnerChange<Camera>): babylCamera => {
    let ret: babylCamera;
    switch (node.next.type) {
      case 'arc-rotate': ret = this.updateArcRotateCamera_(node as Patch.InnerChange<Camera.ArcRotate>); break;
      case 'none': ret = this.camera_; break;
    }

    return ret;
  };

  private cachedCollideCallbacks_: Dict<{
    callback: (collisionEvent: IPhysicsCollisionEvent) => void;
  }[]> = {};

  private restorePhysicsToObject = (mesh: AbstractMesh, objectNode: Node.Obj | Node.FromSpaceTemplate, nodeId: string, scene: Scene): void => {
    // Physics should only be added to physics-enabled, visible, non-selected objects
    if (
      !objectNode.physics ||
      !objectNode.visible ||
      (nodeId && scene.selectedNodeId === nodeId) ||
      (mesh.physicsBody)
    ) {
      return;
    }

    const initialParent = mesh.parent;
    mesh.setParent(null);
    const aggregate = new PhysicsAggregate(mesh, PHYSICS_SHAPE_TYPE_MAPPINGS[objectNode.physics.type], {
      mass: objectNode.physics.mass ? Mass.toGramsValue(objectNode.physics.mass) : 0,
      friction: objectNode.physics.friction ?? 5,
      restitution: objectNode.physics.restitution ?? 0.5,
    }, this.bScene_);

    if (this.physicsViewer_) {
      this.physicsViewer_.showBody(mesh.physicsBody);
    }
    mesh.setParent(initialParent);
    this.syncCollisionFilters_();
  };

  
  private removePhysicsFromObject = (mesh: AbstractMesh) => {
    if (!mesh.physicsBody) return;

    const parent = mesh.parent;
    mesh.setParent(null);

    if (this.physicsViewer_) {
      this.physicsViewer_.hideBody(mesh.physicsBody);
    }
    mesh.physicsBody.shape.dispose();
    mesh.physicsBody.dispose();
    mesh.physicsBody = null;


    mesh.setParent(parent);

    this.syncCollisionFilters_();
  };

  private collisionFilters_: Dict<Set<string>> = {};
  private intersectionFilters_: Dict<Set<string>> = {};

  private syncCollisionFilters_ = () => {
    for (const nodeId in this.collisionFilters_) {
      const meshes = this.nodeMeshes_(nodeId);
      if (meshes.length === 0) continue;

      const meshcopy = meshes
        .map(mesh => mesh.physicsBody)
        .filter(body => !body);

      if (meshcopy.length === 0) continue;

      const filterIds = this.collisionFilters_[nodeId];

      const otherBodies = Array.from(filterIds)
        .map(id => this.nodeMeshes_(id))
        .reduce((acc, val) => [...acc, ...val], [])
        .filter(mesh => mesh && mesh.physicsBody)
        .map(mesh => mesh.physicsBody);

      for (const body of meshcopy) {
        const observable = body.getCollisionObservable();
        observable.add(this.onCollideEvent_);
      }
    }
  };

  private onCollisionFiltersChanged_ = (nodeId: string, filterIds: Set<string>) => {
    this.collisionFilters_[nodeId] = filterIds;
    this.syncCollisionFilters_();
  };

  private onIntersectionFiltersChanged_ = (nodeId: string, filterIds: Set<string>) => {
    if (SetOps.intersection(filterIds, Dict.keySet(this.robotBindings_)).size > 0) {
      throw new Error(`Cannot add a robot to a collision's filter. Please make the robot the primary nodeId.`);
    }
    
    this.intersectionFilters_[nodeId] = filterIds;
    this.syncCollisionFilters_();
  };

  private onCollideEvent_ = (
    collisionEvent: IPhysicsCollisionEvent,
  ) => {

    const collider = collisionEvent.collider;
    const collidedWith = collisionEvent.collidedAgainst;
    const point = collisionEvent.point;

    if (!('metadata' in collider.transformNode)) return;
    if (!('metadata' in collidedWith.transformNode)) return;

    const colliderMetadata = collider.transformNode.metadata as SceneMeshMetadata;
    const collidedWithMetadata = collidedWith.transformNode.metadata as SceneMeshMetadata;

    if (!colliderMetadata) return;
    if (!collidedWithMetadata) return;

    this.scriptManager_.trigger(ScriptManager.Event.collision({
      nodeId: colliderMetadata.id,
      otherNodeId: collidedWithMetadata.id,
      point: Vector3wUnits.fromRaw(RawVector3.fromBabylon(point), RENDER_SCALE),
    }));
  };

  
  readonly setScene = async (scene: Scene, robots: Dict<Robot>) => {
    this.robots_ = robots;
    const patch = Scene.diff(this.scene_, scene);
    const nodeIds = Dict.keySet(patch.nodes);
    const removedKeys: Set<string> = new Set();

    // We need to handle removals first
    for (const nodeId of nodeIds) {
      const node = patch.nodes[nodeId];
      if (node.type !== Patch.Type.Remove) continue;
      await this.updateNode_(nodeId, node, patch.geometry, scene);
      
      delete this.nodes_[nodeId];
      delete this.shadowGenerators_[nodeId];
      delete this.intersectionFilters_[nodeId];

      removedKeys.add(nodeId);
    }

    // Now get a breadth-first sort of the remaining nodes (we need to make sure we add parents first)
    const sortedNodeIds = Scene.nodeOrdering(scene);
    for (const nodeId of sortedNodeIds) {
      if (removedKeys.has(nodeId)) continue;
      const node = patch.nodes[nodeId];

      const updatedNode = await this.updateNode_(nodeId, node, patch.geometry, scene);
      if (updatedNode) {
        this.nodes_[nodeId] = updatedNode;
      }
    }

    if (patch.selectedNodeId.type === Patch.Type.OuterChange) {
      const { prev, next } = patch.selectedNodeId;

      // Re-enable physics on the now unselected node
      if (prev !== undefined) {
        // Get the scene object, resolving templates if needed
        let prevNodeObj: Node.Obj;
        const prevNode = scene.nodes[prev];
        if (prevNode.type === 'object') prevNodeObj = prevNode;
        else if (prevNode.type === 'from-jbc-template') {
          const nodeTemplate = preBuiltTemplates[prevNode.templateId];
          if (nodeTemplate?.type === 'object') prevNodeObj = { ...nodeTemplate, ...Node.Base.upcast(prevNode) };
        } else if (prevNode.type === 'from-rock-template') {
          const nodeTemplate = preBuiltTemplates[prevNode.templateId];
          if (nodeTemplate?.type === 'object') prevNodeObj = { ...nodeTemplate, ...Node.Base.upcast(prevNode) };
        } else if (prevNode.type === 'from-space-template') {
          const nodeTemplate = preBuiltTemplates[prevNode.templateId];
          if (nodeTemplate?.type === 'object') prevNodeObj = { ...nodeTemplate, ...Node.Base.upcast(prevNode) };
        }
        
        const prevBNode = this.bScene_.getNodeById(prev);
        if (prevNodeObj && (prevBNode instanceof AbstractMesh || prevBNode instanceof TransformNode)) {
          prevBNode.metadata = { ...(prevBNode.metadata as SceneMeshMetadata), selected: false };
          SceneBinding.apply_(prevBNode, m => this.restorePhysicsToObject(m, prevNodeObj, prev, scene));
        }

        this.gizmoManager_.attachToNode(null);
      }

      // Disable physics on the now selected node
      if (next !== undefined) {
        const node = this.bScene_.getNodeById(next);
        if (node instanceof AbstractMesh || node instanceof TransformNode) {
          SceneBinding.apply_(node, m => this.removePhysicsFromObject(m));
          node.metadata = { ...(node.metadata as SceneMeshMetadata), selected: true };
          this.gizmoManager_.attachToNode(node);
        }
      }
    }

    const oldCamera = this.camera_;
    switch (patch.camera.type) {
      case Patch.Type.OuterChange: {
        this.camera_ = this.createCamera_(patch.camera.next);
        break;
      }
      case Patch.Type.InnerChange: {
        if (this.camera_) this.camera_ = this.updateCamera_(patch.camera);
        else this.camera_ = this.createCamera_(patch.camera.next);
        break;
      }
    }

    if (oldCamera !== this.camera_) {
      oldCamera.detachControl(this.bScene_.getEngine().getRenderingCanvas());
      this.bScene_.detachControl();
      this.bScene_.removeCamera(oldCamera);
      
      // Creating the camera already added it to the  scene, so no need to call bScene_.addCamera()
      this.bScene_.activeCamera = this.camera_;
      if (this.engineView_) this.camera_.attachControl(this.engineView_.target, true);
      this.bScene_.attachControl();
      oldCamera.dispose();
    }

    if (patch.gravity.type === Patch.Type.OuterChange) {
      const gravity_scalar = new Vector3(1,10,1); // This seems to be somewhat realistic
      this.bScene_.getPhysicsEngine().setGravity(Vector3wUnits.toBabylon(patch.gravity.next, 'meters').multiply(gravity_scalar));
    }

    // Scripts **must** be initialized after the scene is fully loaded
    const reinitializedScripts = new Set<string>();
    for (const scriptId in patch.scripts) {
      const script = patch.scripts[scriptId];
      switch (script.type) {
        case Patch.Type.Add:
        case Patch.Type.OuterChange: {
          this.scriptManager_.set(scriptId, script.next);
          reinitializedScripts.add(scriptId);
          break;
        }
        case Patch.Type.Remove: {
          this.scriptManager_.remove(scriptId);
          break;
        }
      }
    }

    // Iterate through all nodes to find reinitialized binds
    for (const nodeId in scene.nodes) {
      const node = scene.nodes[nodeId];
      for (const scriptId of node.scriptIds || []) {
        if (reinitializedScripts.has(scriptId)) this.scriptManager_.bind(scriptId, nodeId);
      }
    }
    this.scene_ = scene;
  };

  private currentIntersections_: Dict<Set<string>> = {};

  private nodeMeshes_ = (id: string): AbstractMesh[] => {
    if (id in this.robotBindings_) return Dict.values(this.robotBindings_[id].links);
    const bNode = this.findBNode_(id);
    if (bNode && bNode instanceof AbstractMesh) return [bNode];

    return [];
  };

  private nodeMinMaxes_ = (id: string): { min: Vector3; max: Vector3; }[] => {
    const meshes = this.nodeMeshes_(id);
    if (meshes.length === 0) return [];

    const ret: { min: Vector3; max: Vector3; }[] = [];
    for (const mesh of meshes) ret.push(mesh.getHierarchyBoundingVectors());

    return ret;
  };

  private nodeBoundingBoxes_ = (id: string): BoundingBox[] => this.nodeMinMaxes_(id)
    .map(({ min, max }) => new BoundingBox(min, max));

  tick(abstractRobots: Dict<AbstractRobot.Readable>): Dict<RobotBinding.TickOut> {
    if (this.declineTicks_) return undefined;

    const ret: Dict<RobotBinding.TickOut> = {};
    for (const nodeId in this.scene_.nodes) {
      const abstractRobot = abstractRobots[nodeId];
      if (!abstractRobot) continue;

      const robotBinding = this.robotBindings_[nodeId];
      if (!robotBinding) throw new Error(`No robot binding for node ${nodeId}`);

      ret[nodeId] = robotBinding.tick(abstractRobots[nodeId]);
    }

    // Update intersections
    for (const nodeId in this.intersectionFilters_) {
      try {
        const nodeBoundingBoxes = this.nodeBoundingBoxes_(nodeId); //
        const filterIds = this.intersectionFilters_[nodeId];
        for (const filterId of filterIds) {
          const filterMinMaxes = this.nodeMinMaxes_(filterId);
  
          let intersection = false;
          for (const nodeBoundingBox of nodeBoundingBoxes) {
            for (const filterMinMax of filterMinMaxes) {
              intersection = nodeBoundingBox.intersectsMinMax(filterMinMax.min, filterMinMax.max);
              if (intersection) break;
            }
            if (intersection) break;
          }
  
          if (intersection) {
            if (!this.currentIntersections_[nodeId]) this.currentIntersections_[nodeId] = new Set();
            else if (this.currentIntersections_[nodeId].has(filterId)) continue;
  
            this.currentIntersections_[nodeId].add(filterId);
  
            this.scriptManager_.trigger(ScriptManager.Event.intersectionStart({
              nodeId,
              otherNodeId: filterId,
            }));
          } else {
            if (!this.currentIntersections_[nodeId] || !this.currentIntersections_[nodeId].has(filterId)) continue;
  
            this.currentIntersections_[nodeId].delete(filterId);
  
            this.scriptManager_.trigger(ScriptManager.Event.intersectionEnd({
              nodeId,
              otherNodeId: filterId,
            }));
          }
        }
      } catch (e) {
        delete this.intersectionFilters_[nodeId];
      }
    }

    return ret;
  }

  set realisticSensors(realisticSensors: boolean) {
    for (const robotBinding of Object.values(this.robotBindings_)) {
      robotBinding.realisticSensors = realisticSensors;
    }
  }

  set noisySensors(noisySensors: boolean) {
    for (const robotBinding of Object.values(this.robotBindings_)) {
      robotBinding.noisySensors = noisySensors;
    }
  }
}

const PHYSICS_SHAPE_TYPE_MAPPINGS: { [key in Node.Physics.Type]: number } = {
  'box': PhysicsShapeType.BOX,
  'sphere': PhysicsShapeType.SPHERE,
  'cylinder': PhysicsShapeType.CYLINDER,
  'mesh': PhysicsShapeType.MESH,
  'none': PhysicsShapeType.CONVEX_HULL,
};

export default SceneBinding;