import * as THREE from 'three';
import Stats from 'three/addons/libs/stats.module.js';
import { GUI } from 'three/addons/libs/lil-gui.module.min.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

let container, stats, clock, gui, mixer, actions, activeAction, previousAction;
let camera, scene, renderer, model, face, controls;
let terrainTiles = [], baseTile;
let tileSize = 20, scaleFactor = 5;
const tileRepeat = 3;

const api = { state: 'Walking' };
const keys = { w: false, a: false, s: false, d: false, shift: false };
const moveSpeed = 0.1;
let currentMovement = 'Idle';

init();

function init() {
	container = document.createElement('div');
	document.body.appendChild(container);

	camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.25, 100);
	camera.position.set(-5, 3, 10);
	camera.lookAt(0, 2, 0);

	scene = new THREE.Scene();
	scene.background = new THREE.Color(0xe0e0e0);
	clock = new THREE.Clock();

	const hemiLight = new THREE.HemisphereLight(0xffffff, 0x8d8d8d, 3);
	scene.add(hemiLight);

	const dirLight = new THREE.DirectionalLight(0xffffff, 3);
	dirLight.position.set(0, 20, 10);
	scene.add(dirLight);

	renderer = new THREE.WebGLRenderer({ antialias: true });
	renderer.setPixelRatio(window.devicePixelRatio);
	renderer.setSize(window.innerWidth, window.innerHeight);
	renderer.setAnimationLoop(animate);
	container.appendChild(renderer.domElement);

	controls = new OrbitControls(camera, renderer.domElement);
	controls.enableDamping = true;
	controls.target.set(0, 2, 0);

	// Load terrain base tile
	new GLTFLoader().load('UnevenTerrain.glb', function (gltf) {
		baseTile = gltf.scene;
		baseTile.scale.set(scaleFactor, scaleFactor, scaleFactor);
		createTerrainGrid();
	}, undefined, console.error);

	// Load robot model
	new GLTFLoader().load('RobotExpressive.glb', function (gltf) {
		model = gltf.scene;
		scene.add(model);
		createGUI(model, gltf.animations);

		// Position robot above terrain after delay to allow tiles to load
		setTimeout(() => {
			const spawnPos = new THREE.Vector3(0, 20, 0);
			const raycaster = new THREE.Raycaster(spawnPos, new THREE.Vector3(0, -1, 0));
			const hits = terrainTiles.flatMap(tile => raycaster.intersectObject(tile, true));
			if (hits.length > 0) {
				model.position.copy(hits[0].point);
			} else {
				model.position.set(0, 0, 0);
			}
		}, 500);
	}, undefined, console.error);

	window.addEventListener('resize', onWindowResize);
	document.addEventListener('keydown', onKeyDown);
	document.addEventListener('keyup', onKeyUp);

	stats = new Stats();
	container.appendChild(stats.dom);
}

function createTerrainGrid() {
	const half = Math.floor(tileRepeat / 2);
	const tileSpacing = tileSize * scaleFactor * 0.99; // Slight overlap to hide seams

	for (let i = -half; i <= half; i++) {
		for (let j = -half; j <= half; j++) {
			const tile = baseTile.clone(true);
			tile.position.set(i * tileSpacing, 0, j * tileSpacing);
			scene.add(tile);
			terrainTiles.push(tile);
		}
	}
}


function repositionTerrain() {
	const spacing = tileSize * scaleFactor * 0.99;
	const centerX = Math.round(model.position.x / spacing) * spacing;
	const centerZ = Math.round(model.position.z / spacing) * spacing;

	let idx = 0;
	for (let i = -1; i <= 1; i++) {
		for (let j = -1; j <= 1; j++) {
			if (terrainTiles[idx]) {
				terrainTiles[idx].position.set(
					centerX + i * spacing,
					0,
					centerZ + j * spacing
				);
				idx++;
			}
		}
	}
}


function createGUI(model, animations) {
	const states = ['Idle', 'Walking', 'Running', 'Dance', 'Death', 'Sitting', 'Standing'];
	const emotes = ['Jump', 'Yes', 'No', 'Wave', 'Punch', 'ThumbsUp'];

	gui = new GUI();
	mixer = new THREE.AnimationMixer(model);
	actions = {};

	for (let clip of animations) {
		const action = mixer.clipAction(clip);
		actions[clip.name] = action;
		if (emotes.includes(clip.name) || states.indexOf(clip.name) >= 4) {
			action.clampWhenFinished = true;
			action.loop = THREE.LoopOnce;
		}
	}

	const statesFolder = gui.addFolder('States');
	statesFolder.add(api, 'state').options(states).onChange(() => {
		currentMovement = api.state;
		fadeToAction(api.state, 0.5);
	});
	statesFolder.open();

	const emoteFolder = gui.addFolder('Emotes');
	for (let name of emotes) {
		api[name] = () => {
			fadeToAction(name, 0.2);
			mixer.addEventListener('finished', restoreState);
		};
		emoteFolder.add(api, name);
	}
	emoteFolder.open();

	face = model.getObjectByName('Head_4');
	const expressions = Object.keys(face.morphTargetDictionary);
	const expressionFolder = gui.addFolder('Expressions');
	expressions.forEach((name, i) => {
		expressionFolder.add(face.morphTargetInfluences, i, 0, 1, 0.01).name(name);
	});
	expressionFolder.open();

	activeAction = actions['Walking'];
	activeAction.play();
}

function fadeToAction(name, duration) {
	if (activeAction === actions[name]) return;
	previousAction = activeAction;
	activeAction = actions[name];
	if (previousAction !== activeAction) previousAction.fadeOut(duration);
	activeAction.reset().setEffectiveTimeScale(1).setEffectiveWeight(1).fadeIn(duration).play();
}

function restoreState() {
	mixer.removeEventListener('finished', restoreState);
	fadeToAction(currentMovement, 0.2);
}

function onWindowResize() {
	camera.aspect = window.innerWidth / window.innerHeight;
	camera.updateProjectionMatrix();
	renderer.setSize(window.innerWidth, window.innerHeight);
	controls.update();
}

function onKeyDown(event) {
	switch (event.key.toLowerCase()) {
		case 'w': keys.w = true; break;
		case 'a': keys.a = true; break;
		case 's': keys.s = true; break;
		case 'd': keys.d = true; break;
		case 'shift': keys.shift = true; break;
		case ' ': if (model) fadeToAction('Jump', 0.2); break;
	}
}

function onKeyUp(event) {
	switch (event.key.toLowerCase()) {
		case 'w': keys.w = false; break;
		case 'a': keys.a = false; break;
		case 's': keys.s = false; break;
		case 'd': keys.d = false; break;
		case 'shift': keys.shift = false; break;
	}
}

function updateRobotMovement() {
	if (!model || terrainTiles.length === 0) return;

	const direction = new THREE.Vector3();
	const forward = new THREE.Vector3();
	const right = new THREE.Vector3();

	// Extract camera basis vectors
	camera.getWorldDirection(forward); // forward = -Z
	forward.y = 0;
	forward.normalize();

	right.crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize();

	// Compose movement vector from input
	if (keys.w) direction.add(forward);
	if (keys.s) direction.sub(forward);
	if (keys.a) direction.sub(right);
	if (keys.d) direction.add(right);

	if (direction.length() > 0) {
		direction.normalize();

		const speed = keys.shift ? moveSpeed * 2 : moveSpeed;
		const velocity = direction.clone().multiplyScalar(speed);
		const newPos = model.position.clone().add(velocity);

		// Raycast for terrain height
		const raycaster = new THREE.Raycaster(
			new THREE.Vector3(newPos.x, 20, newPos.z),
			new THREE.Vector3(0, -1, 0)
		);

		let intersections = [];
		for (let tile of terrainTiles) {
			const hits = raycaster.intersectObject(tile, true);
			if (hits.length > 0) intersections.push(...hits);
		}

		if (intersections.length > 0) {
			intersections.sort((a, b) => a.distance - b.distance);
			newPos.y = intersections[0].point.y;
		} else {
			newPos.y = 0;
		}

		model.position.copy(newPos);

		// Smoothly rotate the model to face movement direction
		const targetQuaternion = new THREE.Quaternion().setFromUnitVectors(
			new THREE.Vector3(0, 0, 1), // forward
			direction.clone().normalize()
		);
		model.quaternion.slerp(targetQuaternion, 0.2);

		// Animation state
		if (keys.shift && currentMovement !== 'Running') {
			currentMovement = 'Running';
			fadeToAction('Running', 0.2);
		} else if (!keys.shift && currentMovement !== 'Walking') {
			currentMovement = 'Walking';
			fadeToAction('Walking', 0.2);
		}

		repositionTerrain();
	} else if (currentMovement !== 'Idle') {
		currentMovement = 'Idle';
		fadeToAction('Idle', 0.2);
	}
}


function updateThirdPersonCamera() {
	if (!model) return;

	// Desired camera offset from robot in world space
	const offset = new THREE.Vector3(0, 5, -10); // Behind and above the robot

	// Convert offset to world space based on robot orientation
	const cameraTarget = model.position.clone();
	const cameraOffset = offset.clone().applyQuaternion(model.quaternion);
	const desiredCameraPos = cameraTarget.clone().add(cameraOffset);

	// Terrain-aware adjustment: raycast below desired camera pos
	const raycaster = new THREE.Raycaster(
		new THREE.Vector3(desiredCameraPos.x, desiredCameraPos.y + 10, desiredCameraPos.z),
		new THREE.Vector3(0, -1, 0)
	);
	let intersects = [];
	for (let tile of terrainTiles) {
		intersects.push(...raycaster.intersectObject(tile, true));
	}

	// If terrain below, ensure camera stays just above ground
	if (intersects.length > 0) {
		const groundY = intersects[0].point.y;
		if (desiredCameraPos.y < groundY + 2.5) {
			desiredCameraPos.y = groundY + 2.5;
		}
	}

	// Smooth camera transition
	camera.position.lerp(desiredCameraPos, 0.1);

	// Always look slightly above robot’s head
	const lookTarget = model.position.clone().add(new THREE.Vector3(0, 2, 0));
	camera.lookAt(lookTarget);
}



function animate() {
	const dt = clock.getDelta();
	if (mixer) mixer.update(dt);
	updateRobotMovement();
	updateThirdPersonCamera();
	renderer.render(scene, camera);
	stats.update();
}

