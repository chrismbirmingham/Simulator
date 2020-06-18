import * as React from 'react';
import { App } from './App';
import * as Sim from './Sim';
import WorkerInstance from './WorkerInstance';
import { RobotState } from './RobotState';
import * as Babylon from 'babylonjs';

export interface ContainerProps { }
interface ContainerState {
	robot: RobotState
}
type Props = ContainerProps;
type State = ContainerState;

document.body.onload = () => {
		const canvas = document.getElementById('simview') as HTMLCanvasElement;
		const holder = document.getElementById('right') as HTMLDivElement;
		const engine = new Babylon.Engine(canvas, true, {preserveDrawingBuffer: true, stencil: true});
		const space = new Sim.Space();
		const scene = space.createScene(engine, canvas);
		engine.runRenderLoop(function(){
			scene.render();
		});
		
		canvas.addEventListener('resize', function(){
			engine.resize();
			console.log('Yay!');
		})/*

		const factory = new Sim.ShapeFactory(engine);

		const textureLoader = new THREE.TextureLoader();

		// GROUND
		{
			// const pos = new THREE.Vector3(0, -0.5, 0);
			// const quat = new THREE.Quaternion(0, 0, 0, 1);
			// const ground = factory.createParalellepiped(100, 1, 100, 0, pos, quat, new THREE.MeshPhongMaterial({ color: 0xFFFFFF }));
			// ground.castShadow = true;
			// ground.receiveShadow = true;
			// textureLoader.load("static/Surface-A.png", (texture) => {
			// 	texture.wrapS = THREE.RepeatWrapping;
			// 	texture.wrapT = THREE.RepeatWrapping;
			// 	//texture.repeat.set(5, 5);
			// 	(ground.material as any).map = texture;
			// 	(ground.material as any).needsUpdate = true;
			// });
			// engine.addObject(ground);
			factory.createGround();

		}

		//Robot
		factory.getRobot();

		// START THE ENGINE
		function animate() {
			engine.update();
			requestAnimationFrame(animate);
			if (factory.wheels1) {
				for (const wheel of factory.wheels1.children) {
					wheel.rotation.y -= 1;
				}
			}
			if (factory.wheels2) {
				for (const wheel of factory.wheels2.children) {
					wheel.rotation.y += 1;
				}
			}
			//const deltaTime = engine.update(controls.enabled);
			//engine.update(true);
		}
		animate();*/
};


export class Container extends React.Component<Props, State> {
	constructor(props: Props, context?) {
		super(props, context)
		this.state = {
			robot: WorkerInstance.state
		}
	}
	private onStateChange = (state: RobotState) => {
		//console.log('state change'); 
		this.setState({
			robot: state
		});

	}

	componentWillMount() {
		WorkerInstance.onStateChange = this.onStateChange
	}

	private onRobotChange_ = (robot: RobotState) => {
		WorkerInstance.state = robot;
	};

	render() {
		const {
			props, state
		} = this

		//console.log('qwe')

		return (
			<section id="app">
				<App robot={state.robot} onRobotChange={this.onRobotChange_} />
			</section>
		)
	}
}

//All logic inside of index.tsx