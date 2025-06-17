import * as THREE from 'three';
import Stats from 'three/addons/libs/stats.module.js';
import { GUI } from 'three/addons/libs/lil-gui.module.min.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

let container, stats, clock, gui, mixer, actions, activeAction, previousAction;
let camera, scene, renderer, model, face, terrain, controls;

const api = { state: 'Walking' };
const keys = { w: false, a: false, s: false, d: false, shift: false };
const moveSpeed = 0.1;
let currentMovement = 'Idle';

// Terrain parameters
const TERRAIN_SIZE = 100;
const TERRAIN_SEGMENTS = 100;
const TERRAIN_HEIGHT = 5;

init();

function init() {
	container = document.createElement('div');
	document.body.appendChild(container);

	camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.25, 100);
	camera.position.set(-5, 3, 10);
	camera.lookAt(0, 2, 0);

	scene = new THREE.Scene();
	scene.background = new THREE.Color(0xe0e0e0);
	scene.fog = new THREE.Fog(0xe0e0e0, 20, 100);
	clock = new THREE.Clock();

	const hemiLight = new THREE.HemisphereLight(0xffffff, 0x8d8d8d, 3);
	scene.add(hemiLight);

	const dirLight = new THREE.DirectionalLight(0xffffff, 3);
	dirLight.position.set(0, 20, 10);
	scene.add(dirLight);

	createTerrain();

	renderer = new THREE.WebGLRenderer({ antialias: true });
	renderer.setPixelRatio(window.devicePixelRatio);
	renderer.setSize(window.innerWidth, window.innerHeight);
	renderer.setAnimationLoop(animate);
	container.appendChild(renderer.domElement);

	controls = new OrbitControls(camera, renderer.domElement);
	controls.enableDamping = true;
	controls.target.set(0, 2, 0);

	const loader = new GLTFLoader();
	loader.load('RobotExpressive.glb', function (gltf) {
		model = gltf.scene;
		scene.add(model);
		createGUI(model, gltf.animations);
	}, undefined, function (e) {
		console.error(e);
	});

	window.addEventListener('resize', onWindowResize);
	document.addEventListener('keydown', onKeyDown);
	document.addEventListener('keyup', onKeyUp);

	stats = new Stats();
	container.appendChild(stats.dom);
}

function createTerrain() {
	// Create terrain geometry
	const geometry = new THREE.PlaneGeometry(
		TERRAIN_SIZE,
		TERRAIN_SIZE,
		TERRAIN_SEGMENTS,
		TERRAIN_SEGMENTS
	);
	geometry.rotateX(-Math.PI / 2);

	// Generate height map
	const vertices = geometry.attributes.position.array;
	for (let i = 0; i < vertices.length; i += 3) {
		const x = vertices[i];
		const z = vertices[i + 2];
		// Create interesting terrain using multiple sine waves
		vertices[i + 1] = Math.sin(x * 0.1) * Math.cos(z * 0.1) * TERRAIN_HEIGHT +
			Math.sin(x * 0.2 + z * 0.2) * TERRAIN_HEIGHT * 0.5;
	}

	geometry.computeVertexNormals();

	// Create terrain mesh
	const material = new THREE.MeshPhongMaterial({
		color: 0x3d9970,
		flatShading: true,
		wireframe: false
	});

	terrain = new THREE.Mesh(geometry, material);
	scene.add(terrain);

	// Add grid helper
	const grid = new THREE.GridHelper(TERRAIN_SIZE, 20, 0x000000, 0x000000);
	grid.material.opacity = 0.2;
	grid.material.transparent = true;
	scene.add(grid);
}

function getTerrainHeight(x, z) {
	// Convert world coordinates to terrain coordinates
	const terrainX = (x + TERRAIN_SIZE / 2) / TERRAIN_SIZE;
	const terrainZ = (z + TERRAIN_SIZE / 2) / TERRAIN_SIZE;

	// Get the height at the given position using the same height map function
	return Math.sin(x * 0.1) * Math.cos(z * 0.1) * TERRAIN_HEIGHT +
		Math.sin(x * 0.2 + z * 0.2) * TERRAIN_HEIGHT * 0.5;
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
	const clipCtrl = statesFolder.add(api, 'state').options(states);
	clipCtrl.onChange(() => {
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
	for (let i = 0; i < expressions.length; i++) {
		expressionFolder.add(face.morphTargetInfluences, i, 0, 1, 0.01).name(expressions[i]);
	}
	expressionFolder.open();

	activeAction = actions['Walking'];
	activeAction.play();
}

function fadeToAction(name, duration) {
	if (activeAction === actions[name]) return;

	previousAction = activeAction;
	activeAction = actions[name];

	if (previousAction !== activeAction) {
		previousAction.fadeOut(duration);
	}
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
	if (!model) return;

	const moveDirection = new THREE.Vector3();
	if (keys.w) moveDirection.z -= 1;
	if (keys.s) moveDirection.z += 1;
	if (keys.a) moveDirection.x -= 1;
	if (keys.d) moveDirection.x += 1;

	if (moveDirection.length() > 0) {
		moveDirection.normalize();

		const speed = keys.shift ? moveSpeed * 2 : moveSpeed;
		const newPos = model.position.clone();
		newPos.x += moveDirection.x * speed;
		newPos.z += moveDirection.z * speed;

		// Update Y position based on terrain height
		newPos.y = getTerrainHeight(newPos.x, newPos.z);
		model.position.copy(newPos);

		const targetRotation = Math.atan2(moveDirection.x, moveDirection.z);
		model.rotation.y = targetRotation;

		if (keys.shift && currentMovement !== 'Running') {
			currentMovement = 'Running';
			fadeToAction('Running', 0.2);
		} else if (!keys.shift && currentMovement !== 'Walking') {
			currentMovement = 'Walking';
			fadeToAction('Walking', 0.2);
		}
	} else if (currentMovement !== 'Idle') {
		currentMovement = 'Idle';
		fadeToAction('Idle', 0.2);
	}
}

function animate() {
	const dt = clock.getDelta();
	if (mixer) mixer.update(dt);
	updateRobotMovement();
	controls.update();
	renderer.render(scene, camera);
	stats.update();
}
