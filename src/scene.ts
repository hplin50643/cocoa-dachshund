import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import type { CareAction } from './core';

type SceneOptions = { reducedMotion: boolean; onPetClick: () => void };
type ActionAnimation = {
  kind: CareAction;
  time: number;
  duration: number;
  origin: THREE.Vector3;
  yaw: number;
  resolve: () => void;
  reject: (error: Error) => void;
};

const ease = (t: number) => { const v = THREE.MathUtils.clamp(t, 0, 1); return v * v * (3 - 2 * v); };
const material = (color: string, roughness = 0.76) => new THREE.MeshStandardMaterial({ color, roughness });
const brown = material('#995b32');
const warmBrown = material('#b57543');
const muzzleBrown = material('#be8855');
const earBrown = material('#784123');
const innerEarBrown = material('#925739');
const darkBrown = material('#493125');
const black = new THREE.MeshStandardMaterial({ color: '#211d1a', roughness: 0.2, metalness: 0.05 });
const mint = material('#90b7a4');
const gold = new THREE.MeshStandardMaterial({ color: '#d9b56b', roughness: 0.35, metalness: 0.3 });

function ellipsoid(parent: THREE.Object3D, mat: THREE.Material, x: number, y: number, z: number, sx: number, sy: number, sz: number, segments = 32): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, segments, 20), mat);
  mesh.position.set(x, y, z);
  mesh.scale.set(sx, sy, sz);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

function rounded(parent: THREE.Object3D, mat: THREE.Material, x: number, y: number, z: number, w: number, h: number, d: number, r = 0.04): THREE.Mesh {
  const mesh = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 3, Math.min(r, Math.min(w, h, d) * 0.49)), mat);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

function tube(parent: THREE.Object3D, points: THREE.Vector3[], radius: number, mat: THREE.Material, segments = 24): THREE.Mesh {
  const curve = new THREE.CatmullRomCurve3(points);
  const mesh = new THREE.Mesh(new THREE.TubeGeometry(curve, segments, radius, 8, false), mat);
  mesh.castShadow = true;
  parent.add(mesh);
  return mesh;
}

function taperedTail(): THREE.Mesh {
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0, 0), new THREE.Vector3(-0.3, 0.13, 0),
    new THREE.Vector3(-0.65, 0.25, 0.035), new THREE.Vector3(-0.88, 0.41, 0.075),
  ]);
  const geometry = new THREE.TubeGeometry(curve, 28, 1, 10, false);
  const positions = geometry.attributes.position;
  for (let i = 0; i <= 28; i++) {
    const centre = curve.getPointAt(i / 28);
    const radius = THREE.MathUtils.lerp(0.105, 0.014, i / 28);
    for (let j = 0; j <= 10; j++) {
      const index = i * 11 + j;
      const p = new THREE.Vector3().fromBufferAttribute(positions, index).sub(centre).multiplyScalar(radius).add(centre);
      positions.setXYZ(index, p.x, p.y, p.z);
    }
  }
  geometry.computeVertexNormals();
  const tail = new THREE.Mesh(geometry, brown);
  tail.castShadow = true;
  return tail;
}

function createHeart(): THREE.Mesh {
  const shape = new THREE.Shape();
  shape.moveTo(0, -0.32);
  shape.bezierCurveTo(-0.14, -0.16, -0.37, 0.03, -0.29, 0.2);
  shape.bezierCurveTo(-0.19, 0.38, -0.02, 0.3, 0, 0.17);
  shape.bezierCurveTo(0.02, 0.3, 0.19, 0.38, 0.29, 0.2);
  shape.bezierCurveTo(0.37, 0.03, 0.14, -0.16, 0, -0.32);
  const mesh = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: 0.08, bevelEnabled: true, bevelSize: 0.035, bevelThickness: 0.035, bevelSegments: 2, steps: 1 }),
    new THREE.MeshStandardMaterial({ color: '#df958c', roughness: 0.7, transparent: true }));
  mesh.visible = false;
  return mesh;
}

function fabricTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 64;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#d4dfc7';
    ctx.fillRect(0, 0, 64, 64);
    ctx.strokeStyle = 'rgba(255,255,255,.24)';
    ctx.lineWidth = 1.1;
    for (let n = 2; n < 64; n += 4) {
      ctx.beginPath(); ctx.moveTo(n, 0); ctx.lineTo(n, 64); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, n); ctx.lineTo(64, n); ctx.stroke();
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(12, 8);
  return texture;
}

/** A self-contained, asset-free, animated miniature room. All care state lives outside this class. */
export class PetScene {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly world = new THREE.Scene();
  private readonly camera = new THREE.OrthographicCamera(-5, 5, 4, -4, 0.1, 70);
  private readonly controls: OrbitControls;
  private readonly resizeObserver: ResizeObserver;
  private readonly dog = new THREE.Group();
  private readonly body = new THREE.Group();
  private readonly head = new THREE.Group();
  private readonly tail = new THREE.Group();
  private readonly legs: THREE.Group[] = [];
  private readonly ears: THREE.Group[] = [];
  private readonly eyes: THREE.Group[] = [];
  private readonly hearts = [createHeart(), createHeart(), createHeart()];
  private readonly sleepy: THREE.Sprite[] = [];
  private readonly ball = new THREE.Group();
  private readonly kibble: THREE.Object3D[] = [];
  private readonly tongue: THREE.Mesh;
  private readonly home = new THREE.Vector3(-0.55, 0, 0.75);
  private readonly bedPosition = new THREE.Vector3(-1.95, 0.19, -1.72);
  private readonly ballHome = new THREE.Vector3(-0.3, 0.18, 2.35);
  private readonly raycaster = new THREE.Raycaster();
  private action: ActionAnimation | null = null;
  private wander: { from: THREE.Vector3; to: THREE.Vector3; time: number; duration: number } | null = null;
  private nextWander = 10;
  private sleeping = false;
  private sleepBlend = 0;
  private reducedMotion: boolean;
  private disposed = false;
  private frame = 0;
  private lastFrame = 0;
  private time = 0;
  private pointerStart: { x: number; y: number; at: number } | null = null;
  private contextLost = false;
  private failed = false;

  constructor(private readonly container: HTMLElement, private readonly options: SceneOptions) {
    this.reducedMotion = options.reducedMotion;
    this.renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
    this.renderer.setClearColor('#f3eee5', 0);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.12;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.domElement.setAttribute('aria-label', '可旋轉的 3D 臘腸狗客廳，輕點狗狗可以摸摸牠');
    this.renderer.domElement.setAttribute('role', 'img');
    this.renderer.domElement.style.touchAction = 'none';
    this.renderer.domElement.style.display = 'block';
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
    container.appendChild(this.renderer.domElement);

    this.world.add(new THREE.HemisphereLight('#fff4df', '#b5b6a2', 2.55));
    const sun = new THREE.DirectionalLight('#fff0d2', 3.25);
    sun.position.set(-3.5, 9, 4.5);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -7; sun.shadow.camera.right = 7;
    sun.shadow.camera.top = 7; sun.shadow.camera.bottom = -7;
    sun.shadow.camera.near = 1; sun.shadow.camera.far = 25;
    sun.shadow.normalBias = 0.035;
    sun.shadow.bias = -0.00015;
    this.world.add(sun);
    const fill = new THREE.DirectionalLight('#fffaf0', 0.55);
    fill.position.set(5, 4, -2);
    this.world.add(fill);

    this.buildRoom();
    this.tongue = this.buildDog();
    this.dog.position.copy(this.home);
    this.world.add(this.dog);
    this.hearts.forEach(heart => this.world.add(heart));
    this.buildSleepSprites();

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.065;
    this.controls.enablePan = false;
    this.controls.minPolarAngle = Math.PI * 0.22;
    this.controls.maxPolarAngle = Math.PI * 0.43;
    this.controls.minAzimuthAngle = -0.12;
    this.controls.maxAzimuthAngle = 1.2;
    this.controls.minZoom = 0.85;
    this.controls.maxZoom = 1.65;
    this.controls.rotateSpeed = 0.55;
    this.controls.zoomSpeed = 0.65;
    this.resetCamera();
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container);
    this.resize();
    this.renderer.domElement.addEventListener('pointerdown', this.onPointerDown);
    this.renderer.domElement.addEventListener('pointerup', this.onPointerUp);
    this.renderer.domElement.addEventListener('pointercancel', this.onPointerCancel);
    this.renderer.domElement.addEventListener('webglcontextlost', this.onContextLost);
    this.renderer.domElement.addEventListener('webglcontextrestored', this.onContextRestored);
    document.addEventListener('visibilitychange', this.onVisibility);
    this.frame = requestAnimationFrame(this.animate);
  }

  private buildDog(): THREE.Mesh {
    this.dog.add(this.body);
    ellipsoid(this.body, brown, -0.2, 0.92, 0, 1.42, 0.53, 0.52);
    ellipsoid(this.body, warmBrown, 0.72, 0.93, 0, 0.55, 0.63, 0.5);
    ellipsoid(this.body, brown, -1.15, 0.77, 0, 0.5, 0.48, 0.46);
    // The breast joins the long horizontal body to the upright puppy neck.
    const chest = ellipsoid(this.body, warmBrown, 0.88, 1.19, 0, 0.38, 0.59, 0.41);
    chest.rotation.z = -0.3;
    const bib = ellipsoid(this.body, muzzleBrown, 1.12, 0.97, 0, 0.13, 0.34, 0.29);
    bib.rotation.z = -0.18;

    for (const x of [-1.03, 0.77]) {
      for (const z of [-0.36, 0.36]) {
        const leg = new THREE.Group();
        leg.position.set(x, 0.54, z);
        ellipsoid(leg, brown, 0, -0.1, 0, 0.16, 0.3, 0.17);
        ellipsoid(leg, warmBrown, 0.065, -0.37, 0.02, 0.23, 0.14, 0.205);
        for (const toe of [-0.09, 0.01, 0.11]) {
          ellipsoid(leg, darkBrown, 0.25, -0.395, toe, 0.035, 0.026, 0.027, 12);
        }
        this.body.add(leg);
        this.legs.push(leg);
      }
    }

    this.head.position.set(1.02, 1.5, 0);
    this.body.add(this.head);
    ellipsoid(this.head, warmBrown, 0, 0.02, 0, 0.62, 0.6, 0.5);
    ellipsoid(this.head, muzzleBrown, 0.47, -0.18, 0, 0.57, 0.29, 0.33);
    ellipsoid(this.head, warmBrown, 0.27, -0.3, 0, 0.43, 0.16, 0.3);
    ellipsoid(this.head, black, 0.975, -0.13, 0, 0.15, 0.125, 0.205);
    ellipsoid(this.head, new THREE.MeshStandardMaterial({ color: '#81766b', roughness: 0.23 }), 1.045, -0.085, 0.065, 0.035, 0.022, 0.06, 16);

    for (const side of [-1, 1]) {
      const ear = new THREE.Group();
      ear.position.set(-0.22, 0.18, side * 0.44);
      ear.rotation.x = side * -0.12;
      ear.rotation.z = -0.13;
      const outer = ellipsoid(ear, earBrown, -0.04, -0.43, side * 0.025, 0.32, 0.64, 0.14);
      outer.rotation.z = -0.16;
      const inner = ellipsoid(ear, innerEarBrown, 0.01, -0.49, side * 0.141, 0.2, 0.43, 0.018);
      inner.rotation.z = -0.16;
      this.head.add(ear); this.ears.push(ear);

      const eye = new THREE.Group();
      eye.position.set(0.3, 0.13, side * 0.423);
      ellipsoid(eye, earBrown, 0, 0, 0, 0.18, 0.19, 0.105);
      ellipsoid(eye, black, 0.028, 0.01, side * 0.055, 0.142, 0.157, 0.09);
      const shine = new THREE.MeshBasicMaterial({ color: '#fffdf6' });
      ellipsoid(eye, shine, 0.058, 0.069, side * 0.124, 0.044, 0.047, 0.019, 16);
      ellipsoid(eye, shine, -0.018, -0.036, side * 0.135, 0.018, 0.018, 0.009, 12);
      this.head.add(eye); this.eyes.push(eye);
      tube(this.head, [new THREE.Vector3(0.16, 0.38, side * 0.4), new THREE.Vector3(0.28, 0.4, side * 0.43), new THREE.Vector3(0.4, 0.35, side * 0.4)], 0.025, brown, 12);
      tube(this.head, [new THREE.Vector3(0.9, -0.25, side * 0.13), new THREE.Vector3(0.69, -0.36, side * 0.24), new THREE.Vector3(0.43, -0.34, side * 0.27)], 0.012, darkBrown, 16);
      for (const [x, y] of [[0.62, -0.15], [0.53, -0.23], [0.72, -0.21]]) {
        ellipsoid(this.head, earBrown, x, y, side * 0.303, 0.012, 0.012, 0.007, 8);
      }
    }

    const collar = new THREE.Mesh(new THREE.TorusGeometry(0.407, 0.06, 12, 48), mint);
    collar.position.set(0.91, 1.2, 0); collar.rotation.y = Math.PI / 2; collar.rotation.z = -0.3;
    collar.castShadow = true; this.body.add(collar);
    const tag = new THREE.Mesh(new THREE.CylinderGeometry(0.105, 0.105, 0.035, 24), gold);
    tag.position.set(1.015, 0.89, 0.365); tag.rotation.x = Math.PI / 2; this.body.add(tag);
    ellipsoid(this.body, mint, 1.015, 0.89, 0.389, 0.029, 0.035, 0.008, 12);
    this.tail.position.set(-1.46, 1.0, 0); this.tail.add(taperedTail()); this.body.add(this.tail);
    const tongue = ellipsoid(this.head, material('#cf8784'), 0.65, -0.39, 0.04, 0.13, 0.12, 0.06);
    tongue.visible = false;
    return tongue;
  }

  private buildRoom(): void {
    const room = new THREE.Group();
    this.world.add(room);
    const cream = material('#eee5d5');
    const wall = material('#f2e9dc');
    const white = material('#fff8eb');
    const wood = material('#c9a67c');
    const woodLight = material('#dfc5a1');
    rounded(room, cream, 0, -0.21, 0, 9.35, 0.35, 7.35, 0.17);
    rounded(room, woodLight, 0, -0.045, 0, 9.12, 0.12, 7.12, 0.07);
    // Quiet wood seams retain the clean, miniature-room aesthetic.
    const seam = material('#ceb28d');
    for (let z = -3.1; z < 3.5; z += 0.64) {
      rounded(room, seam, 0, 0.017, z, 9.0, 0.006, 0.012, 0.002);
    }
    for (let i = 0; i < 10; i++) {
      rounded(room, seam, (i % 3 - 1) * 2.9, 0.018, -2.78 + i * 0.64, 0.012, 0.006, 0.63, 0.002);
    }
    rounded(room, wall, 0, 1.85, -3.58, 9.35, 3.9, 0.16, 0.06);
    rounded(room, wall, -4.58, 1.85, 0, 0.16, 3.9, 7.3, 0.06);
    rounded(room, white, 0, 0.16, -3.46, 9.15, 0.28, 0.07, 0.025);
    rounded(room, white, -4.46, 0.16, 0, 0.07, 0.28, 7.0, 0.025);

    // Soft sage woven rug, with a cream binding and small tassels.
    rounded(room, material('#eeebd9'), -0.15, 0.045, 0.7, 6.5, 0.055, 3.85, 0.026);
    const rugMat = new THREE.MeshStandardMaterial({ map: fabricTexture(), roughness: 1 });
    rounded(room, rugMat, -0.15, 0.075, 0.7, 6.37, 0.05, 3.72, 0.024);
    for (let z = -0.95; z < 2.45; z += 0.17) {
      for (const x of [-3.45, 3.15]) rounded(room, material('#ede8d2'), x, 0.04, z, 0.17, 0.015, 0.035, 0.006);
    }

    // Window and open curtains, entirely geometry rather than downloaded imagery.
    rounded(room, woodLight, 0.7, 2.52, -3.43, 3.05, 2.05, 0.1, 0.045);
    rounded(room, material('#d9e6df'), 0.7, 2.52, -3.36, 2.81, 1.81, 0.045, 0.018);
    const sunDisc = new THREE.Mesh(new THREE.CircleGeometry(0.27, 32), material('#f2d99e'));
    sunDisc.position.set(1.42, 2.96, -3.325); room.add(sunDisc);
    for (const [x, y, s] of [[-0.15, 2.88, 0.23], [0.13, 2.92, 0.32], [0.42, 2.86, 0.2], [1.6, 2.1, 0.24]]) {
      ellipsoid(room, white, x, y, -3.3, s, s * 0.42, 0.025);
    }
    rounded(room, white, 0.7, 2.52, -3.26, 0.07, 1.89, 0.09, 0.01);
    rounded(room, white, 0.7, 2.52, -3.25, 2.87, 0.07, 0.09, 0.01);
    rounded(room, white, 0.7, 1.5, -3.23, 3.25, 0.13, 0.42, 0.03);
    const curtainMat = material('#f9f0df');
    for (const x of [-0.98, 2.38]) {
      for (let j = -1; j <= 1; j++) ellipsoid(room, curtainMat, x + j * 0.13, 2.47, -3.17, 0.125, 1.06, 0.1);
      rounded(room, material('#d7c7a9'), x, 2.17, -3.04, 0.42, 0.075, 0.055, 0.02);
    }
    rounded(room, wood, 0.7, 3.57, -3.14, 3.95, 0.06, 0.06, 0.025);

    // A small paw-print artwork on the wall.
    rounded(room, wood, -2.85, 2.59, -3.4, 1.12, 1.3, 0.1, 0.07);
    rounded(room, white, -2.85, 2.59, -3.325, 0.94, 1.12, 0.025, 0.012);
    const pawMat = material('#cc9e80');
    ellipsoid(room, pawMat, -2.85, 2.49, -3.295, 0.23, 0.2, 0.025);
    for (const [x, y, r] of [[-3.12, 2.67, 0.09], [-2.95, 2.84, 0.105], [-2.74, 2.84, 0.105], [-2.57, 2.67, 0.09]]) {
      ellipsoid(room, pawMat, x, y, -3.295, r, r * 1.15, 0.025);
    }

    // Generously long bed for a generously long dog.
    const bed = new THREE.Group(); bed.position.set(-1.95, 0.06, -1.72); room.add(bed);
    ellipsoid(bed, material('#b88871'), 0, 0.12, 0, 1.95, 0.18, 0.94);
    const bolster = new THREE.Mesh(new THREE.TorusGeometry(0.79, 0.19, 16, 56), material('#c79c83'));
    bolster.rotation.x = Math.PI / 2; bolster.scale.set(2.08, 1, 1); bolster.position.y = 0.29;
    bolster.castShadow = true; bolster.receiveShadow = true; bed.add(bolster);
    ellipsoid(bed, material('#ead2b7'), 0, 0.21, 0, 1.63, 0.13, 0.67);
    const pillow = rounded(bed, material('#e6dbc5'), -1.05, 0.36, -0.15, 0.64, 0.2, 0.56, 0.095);
    pillow.rotation.y = -0.15;

    this.buildPlant(room, 3.58, -2.68);
    // Low shelf and books add scale without obstructing the pet.
    for (const x of [0.85, 2.15]) for (const z of [-2.58, -3.14]) rounded(room, wood, x, 0.21, z, 0.09, 0.42, 0.09, 0.025);
    rounded(room, woodLight, 1.5, 0.47, -2.86, 1.58, 0.16, 0.85, 0.06);
    for (const [dy, color, width] of [[0.59, '#9eb7ac', 0.63], [0.69, '#dec9a3', 0.69], [0.78, '#d6a08b', 0.58]] as const) {
      const book = rounded(room, material(color), 1.18, dy, -2.86, width, 0.085, 0.43, 0.02); book.rotation.y = dy * 0.24;
    }
    const vase = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.17, 0.35, 24), white);
    vase.position.set(1.99, 0.72, -2.85); vase.castShadow = true; room.add(vase);
    tube(room, [new THREE.Vector3(1.99, 0.82, -2.85), new THREE.Vector3(1.96, 1.1, -2.86), new THREE.Vector3(1.84, 1.24, -2.86)], 0.015, material('#899a6c'));
    ellipsoid(room, material('#d6af81'), 1.84, 1.24, -2.86, 0.12, 0.095, 0.1);

    rounded(room, material('#f1e4c9'), 2.75, 0.11, 0.82, 1.22, 0.035, 2.12, 0.017);
    this.buildBowl(room, 2.73, 1.34, '#d6a08b', false);
    this.buildBowl(room, 2.73, 0.3, '#99b6ac', true);
    ellipsoid(this.ball, material('#e9b77d', 0.65), 0, 0, 0, 0.18, 0.18, 0.18);
    const stripe = new THREE.Mesh(new THREE.TorusGeometry(0.177, 0.014, 8, 32), material('#fbebcf'));
    stripe.rotation.x = 0.55; stripe.rotation.y = 0.7; this.ball.add(stripe);
    this.ball.position.copy(this.ballHome); room.add(this.ball);

    // A restrained patch of afternoon light on the floor.
    const lightPatch = new THREE.Mesh(new THREE.PlaneGeometry(2.3, 1.4), new THREE.MeshBasicMaterial({ color: '#fff7d7', transparent: true, opacity: 0.13, depthWrite: false }));
    lightPatch.rotation.x = -Math.PI / 2; lightPatch.rotation.z = -0.28; lightPatch.position.set(1.45, 0.025, -1.28); room.add(lightPatch);
  }

  private buildPlant(room: THREE.Group, x: number, z: number): void {
    const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.3, 0.66, 32), material('#ece2d1'));
    pot.position.set(x, 0.35, z); pot.castShadow = true; pot.receiveShadow = true; room.add(pot);
    const soil = new THREE.Mesh(new THREE.CylinderGeometry(0.355, 0.355, 0.025, 32), material('#856d51'));
    soil.position.set(x, 0.68, z); room.add(soil);
    const stemMat = material('#8d9670');
    const leafMats = [material('#91a489'), material('#afbb96'), material('#778f75')];
    const leaves: [number, number, number, number][] = [[0.02, 1.85, 0.02, -0.18], [-0.42, 1.54, 0.08, -0.9], [0.42, 1.35, 0.05, 0.85], [-0.3, 1.1, 0.3, -0.8], [0.29, 1.9, -0.13, 0.65], [0.08, 1.27, -0.34, 0.12]];
    leaves.forEach(([dx, y, dz, angle], i) => {
      tube(room, [new THREE.Vector3(x, 0.65, z), new THREE.Vector3(x + dx * 0.45, y - 0.35, z + dz * 0.4), new THREE.Vector3(x + dx, y, z + dz)], 0.018, stemMat);
      const leaf = ellipsoid(room, leafMats[i % 3], x + dx, y + 0.12, z + dz, 0.23, 0.43, 0.075);
      leaf.rotation.z = -angle; leaf.rotation.y = i * 0.8;
    });
  }

  private buildBowl(room: THREE.Group, x: number, z: number, color: string, water: boolean): void {
    const points = [new THREE.Vector2(0.27, 0.04), new THREE.Vector2(0.35, 0.04), new THREE.Vector2(0.43, 0.22), new THREE.Vector2(0.44, 0.26), new THREE.Vector2(0.405, 0.285), new THREE.Vector2(0.37, 0.25), new THREE.Vector2(0.29, 0.11), new THREE.Vector2(0.01, 0.11)];
    const bowl = new THREE.Mesh(new THREE.LatheGeometry(points, 40), material(color, 0.5));
    bowl.position.set(x, 0.12, z); bowl.castShadow = true; bowl.receiveShadow = true; room.add(bowl);
    if (water) {
      const liquid = new THREE.Mesh(new THREE.CircleGeometry(0.34, 40), new THREE.MeshStandardMaterial({ color: '#a5ccd0', roughness: 0.18, metalness: 0.12 }));
      liquid.rotation.x = -Math.PI / 2; liquid.position.set(x, 0.345, z); room.add(liquid);
      const glint = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.008, 8, 40, Math.PI * 0.65), material('#e1eeee'));
      glint.rotation.x = -Math.PI / 2; glint.position.set(x, 0.35, z); room.add(glint);
    } else {
      const food = material('#8e603d');
      for (let i = 0; i < 19; i++) {
        const angle = i * 2.39996; const radius = Math.sqrt(i / 19) * 0.28;
        const piece = ellipsoid(room, food, x + Math.cos(angle) * radius, 0.32 + (i % 3) * 0.025, z + Math.sin(angle) * radius, 0.065, 0.046, 0.049, 12);
        piece.rotation.y = angle; this.kibble.push(piece);
      }
    }
  }

  private buildSleepSprites(): void {
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 128;
    const ctx = canvas.getContext('2d');
    if (ctx) { ctx.fillStyle = '#7f927a'; ctx.font = 'bold 92px Georgia, serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('z', 64, 59); }
    const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
    for (let i = 0; i < 3; i++) {
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, opacity: 0 }));
      sprite.scale.setScalar(0.3 + i * 0.08); sprite.visible = false; this.world.add(sprite); this.sleepy.push(sprite);
    }
  }

  interact(action: CareAction): Promise<void> {
    if (this.disposed) return Promise.reject(new Error('3D 場景已關閉。'));
    if (this.action) return Promise.reject(new Error('狗狗正在完成上一個動作。'));
    if (this.contextLost || this.failed) return Promise.reject(new Error('3D 畫面暫時無法使用，請重新整理。'));
    if (this.sleeping) this.wake();
    this.wander = null;
    this.nextWander = this.time + 12;
    return new Promise((resolve, reject) => {
      this.action = { kind: action, time: 0, duration: action === 'play' ? 4.8 : action === 'sleep' ? 1.8 : action === 'pet' ? 2.7 : 3.6, origin: this.dog.position.clone(), yaw: this.dog.rotation.y, resolve, reject };
    });
  }

  wake(): void {
    this.sleeping = false;
    this.sleepBlend = 0;
    this.dog.position.copy(this.home);
    this.dog.rotation.y = 0;
    this.body.position.y = 0;
    this.body.rotation.set(0, 0, 0);
    this.head.position.set(1.02, 1.5, 0);
    this.head.rotation.set(0, 0, 0);
    this.legs.forEach(leg => { leg.rotation.set(0, 0, 0); });
    this.nextWander = this.time + 10;
    this.sleepy.forEach(sprite => { sprite.visible = false; });
  }

  setReducedMotion(enabled: boolean): void {
    this.reducedMotion = enabled;
    if (enabled) this.wander = null;
    this.nextWander = this.time + 12;
  }

  resetCamera(): void {
    this.camera.position.set(7.8, 6.7, 10.4);
    this.camera.zoom = 1;
    this.controls.target.set(-0.05, 0.75, 0.15);
    this.camera.lookAt(this.controls.target);
    this.controls.update();
    this.camera.updateProjectionMatrix();
  }

  private resize(): void {
    if (this.disposed) return;
    const width = Math.max(1, this.container.clientWidth);
    const height = Math.max(1, this.container.clientHeight);
    const ratio = width / height;
    const span = Math.max(width < 560 ? 5.9 : 6.3, (width < 560 ? 8.15 : 10.2) / ratio);
    this.camera.left = -span * ratio / 2; this.camera.right = span * ratio / 2;
    this.camera.top = span / 2; this.camera.bottom = -span / 2;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
  }

  private onPointerDown = (event: PointerEvent): void => {
    this.pointerStart = event.isPrimary ? { x: event.clientX, y: event.clientY, at: performance.now() } : null;
  };

  private onPointerUp = (event: PointerEvent): void => {
    const start = this.pointerStart; this.pointerStart = null;
    if (!start || !event.isPrimary || performance.now() - start.at > 500 || Math.hypot(event.clientX - start.x, event.clientY - start.y) > 6) return;
    const bounds = this.renderer.domElement.getBoundingClientRect();
    const mouse = new THREE.Vector2((event.clientX - bounds.left) / bounds.width * 2 - 1, -(event.clientY - bounds.top) / bounds.height * 2 + 1);
    this.raycaster.setFromCamera(mouse, this.camera);
    if (this.raycaster.intersectObject(this.dog, true).length) this.options.onPetClick();
  };

  private onPointerCancel = (): void => { this.pointerStart = null; };
  private onVisibility = (): void => { this.lastFrame = performance.now(); };
  private onContextLost = (event: Event): void => {
    event.preventDefault(); this.contextLost = true;
    this.action?.reject(new Error('3D 畫面連線中斷。'));
    this.action = null;
    this.container.dispatchEvent(new CustomEvent('pet-scene-error', { detail: '3D 畫面連線中斷，請重新整理網頁。' }));
  };
  private onContextRestored = (): void => { this.contextLost = false; this.lastFrame = performance.now(); };

  private animate = (now: number): void => {
    if (this.disposed || this.failed) return;
    this.frame = requestAnimationFrame(this.animate);
    const dt = this.lastFrame ? Math.min((now - this.lastFrame) / 1000, 0.05) : 0;
    this.lastFrame = now;
    if (document.hidden || this.contextLost) return;
    this.time += dt;
    this.updateDog(dt);
    this.controls.update();
    try { this.renderer.render(this.world, this.camera); }
    catch {
      this.failed = true;
      cancelAnimationFrame(this.frame);
      this.action?.reject(new Error('3D 畫面無法繼續顯示。'));
      this.action = null;
      this.container.dispatchEvent(new CustomEvent('pet-scene-error', { detail: '3D 畫面無法繼續顯示，請重新整理網頁。' }));
    }
  };

  private updateDog(dt: number): void {
    const t = this.time;
    let stride = 0;
    let headDip = 0;
    let petting = 0;
    let wag = this.sleeping ? 0.03 : 0.18;
    let headTilt = 0;
    this.body.position.y = 0;
    this.body.rotation.z = 0;
    this.hearts.forEach(heart => { heart.visible = false; });
    this.tongue.visible = false;
    this.kibble.forEach(piece => { piece.visible = true; });

    if (this.action) {
      const action = this.action;
      action.time += dt;
      const progress = Math.min(action.time / action.duration, 1);
      if (action.kind === 'feed' || action.kind === 'water') {
        const goal = new THREE.Vector3(0.5, 0, action.kind === 'feed' ? 1.34 : 0.3);
        const approach = ease(progress / 0.24);
        const retreat = ease((progress - 0.78) / 0.22);
        this.dog.position.lerpVectors(action.origin, goal, approach * (1 - retreat));
        this.dog.rotation.y = THREE.MathUtils.lerp(action.yaw, 0, approach);
        if (progress < 0.24 || progress > 0.78) stride = Math.sin(t * 15) * 0.32;
        headDip = ease((progress - 0.16) / 0.14) * (1 - ease((progress - 0.7) / 0.15));
        headDip *= 0.96 + Math.sin(t * 12) * 0.04;
        wag = 0.24;
        if (action.kind === 'water' && headDip > 0.8) this.tongue.visible = Math.sin(t * 17) > 0;
        if (action.kind === 'feed' && progress > 0.3 && progress < 0.8) {
          this.kibble.forEach((piece, i) => { piece.visible = i > (progress - 0.3) * 26; });
        }
      } else if (action.kind === 'pet') {
        petting = Math.sin(progress * Math.PI);
        headTilt = Math.sin(progress * Math.PI) * 0.13;
        wag = 0.65;
        this.tongue.visible = progress > 0.2 && progress < 0.85;
        this.hearts.forEach((heart, i) => {
          const age = (progress * 1.5 - i * 0.19);
          if (age > 0 && age < 1 && !this.reducedMotion) {
            heart.visible = true;
            heart.position.copy(this.dog.position).add(new THREE.Vector3(0.8 + i * 0.37, 2.15 + age * 1.2, 0.12));
            heart.scale.setScalar((0.45 + i * 0.08) * Math.sin(age * Math.PI));
            heart.lookAt(this.camera.position);
            (heart.material as THREE.MeshStandardMaterial).opacity = Math.min(1, (1 - age) * 2);
          }
        });
      } else if (action.kind === 'play') {
        const ballGoal = new THREE.Vector3(2.5, 0.18, 2.15);
        const chaseGoal = new THREE.Vector3(0.5, 0, 2.15);
        if (progress < 0.24) {
          const throwT = progress / 0.24;
          this.ball.position.lerpVectors(this.ballHome, ballGoal, ease(throwT));
          this.ball.position.y += Math.sin(throwT * Math.PI) * 0.8;
          this.ball.rotation.z -= dt * 8;
        } else if (progress < 0.56) {
          const chaseT = ease((progress - 0.24) / 0.32);
          this.dog.position.lerpVectors(action.origin, chaseGoal, chaseT);
          this.dog.rotation.y = THREE.MathUtils.lerp(action.yaw, -0.08, chaseT);
          stride = Math.sin(t * 19) * 0.42;
          this.body.position.y = Math.abs(Math.sin(t * 19)) * 0.04;
          this.ball.position.copy(ballGoal);
        } else if (progress < 0.7) {
          this.dog.position.copy(chaseGoal);
          headDip = Math.sin((progress - 0.56) / 0.14 * Math.PI) * 0.8;
          this.ball.position.copy(ballGoal);
        } else {
          const returnT = ease((progress - 0.7) / 0.3);
          this.dog.position.lerpVectors(chaseGoal, action.origin, returnT);
          stride = Math.sin(t * 17) * 0.35;
          this.ball.position.lerpVectors(ballGoal, this.ballHome, returnT);
          this.ball.position.y += Math.sin(returnT * Math.PI) * 0.15;
          this.ball.rotation.z += dt * 9;
        }
        wag = 0.65;
      } else if (action.kind === 'sleep') {
        const walk = ease(progress / 0.7);
        this.dog.position.lerpVectors(action.origin, this.bedPosition, walk);
        this.dog.rotation.y = THREE.MathUtils.lerp(action.yaw, 0.05, walk);
        stride = progress < 0.7 ? Math.sin(t * 12) * 0.3 : 0;
        this.sleepBlend = ease((progress - 0.55) / 0.45);
        wag = 0.02;
      }
      if (progress >= 1) {
        if (action.kind === 'sleep') { this.sleeping = true; this.sleepBlend = 1; }
        else { this.dog.position.copy(action.origin); this.dog.rotation.y = 0; }
        this.ball.position.copy(this.ballHome);
        this.action = null;
        this.nextWander = t + 8 + Math.random() * 10;
        action.resolve();
      }
    } else if (!this.sleeping && !this.reducedMotion) {
      if (!this.wander && t >= this.nextWander) {
        const to = new THREE.Vector3(-0.9 + Math.random() * 0.85, 0, 0.4 + Math.random() * 0.9);
        this.wander = { from: this.dog.position.clone(), to, time: 0, duration: 2.5 + Math.random() };
      }
      if (this.wander) {
        const w = this.wander; w.time += dt;
        const p = Math.min(w.time / w.duration, 1);
        this.dog.position.lerpVectors(w.from, w.to, ease(p));
        // Gentle side steps keep the expressive face visible in this small room.
        const turn = Math.atan2(-(w.to.z - w.from.z), Math.abs(w.to.x - w.from.x) + 0.5);
        this.dog.rotation.y = THREE.MathUtils.lerp(this.dog.rotation.y, turn, Math.min(1, dt * 4));
        stride = Math.sin(t * 11) * 0.24 * Math.sin(p * Math.PI);
        if (p >= 1) { this.wander = null; this.nextWander = t + 8 + Math.random() * 10; }
      } else {
        this.dog.rotation.y = THREE.MathUtils.lerp(this.dog.rotation.y, 0, Math.min(1, dt * 1.5));
      }
    }

    const sleeping = this.sleepBlend;
    if (sleeping > 0) {
      this.body.position.y -= sleeping * 0.28;
      headDip = Math.max(headDip, sleeping * 0.38);
      this.head.rotation.x = sleeping * 0.13;
    } else this.head.rotation.x = 0;

    const breathe = this.reducedMotion ? 0 : Math.sin(t * (this.sleeping ? 1.9 : 2.4)) * 0.012;
    this.body.scale.y = 1 + breathe;
    this.head.position.set(1.02, 1.5 - headDip * 0.35 - sleeping * 0.16, 0);
    this.head.rotation.z = -headDip * 0.8 + headTilt;
    this.head.rotation.y = this.reducedMotion || this.action || this.sleeping ? 0 : Math.sin(t * 0.7) * 0.035;
    this.tail.rotation.y = this.reducedMotion ? 0 : Math.sin(t * (petting > 0 || wag > 0.5 ? 14 : 6)) * wag;
    this.tail.rotation.z = this.sleeping ? 0.2 : 0;
    this.legs.forEach((leg, i) => {
      leg.rotation.z = stride * (i === 0 || i === 3 ? 1 : -1) - sleeping * 0.75;
    });
    this.ears.forEach((ear, i) => {
      ear.rotation.x = (i === 0 ? 1 : -1) * (0.12 + Math.abs(stride) * 0.25);
      ear.rotation.z = -0.13 + (this.reducedMotion ? 0 : Math.sin(t * 5 + i) * 0.018) + stride * 0.18;
    });
    const blinkPhase = t % 5.8;
    const blink = !this.reducedMotion && blinkPhase > 5.56 ? Math.abs((blinkPhase - 5.68) / 0.12) : 1;
    this.eyes.forEach(eye => { eye.scale.y = this.sleeping || sleeping > 0.65 ? 0.09 : Math.max(0.09, Math.min(blink, 1 - petting * 0.83)); });
    this.sleepy.forEach((sprite, i) => {
      sprite.visible = this.sleeping && !this.reducedMotion;
      if (sprite.visible) {
        const age = (t * 0.35 + i / 3) % 1;
        sprite.position.copy(this.dog.position).add(new THREE.Vector3(1.3 + age * 0.55, 1.5 + age * 1.25, 0.12));
        (sprite.material as THREE.SpriteMaterial).opacity = Math.sin(age * Math.PI) * 0.8;
      }
    });
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    cancelAnimationFrame(this.frame);
    this.resizeObserver.disconnect();
    this.controls.dispose();
    document.removeEventListener('visibilitychange', this.onVisibility);
    const canvas = this.renderer.domElement;
    canvas.removeEventListener('pointerdown', this.onPointerDown);
    canvas.removeEventListener('pointerup', this.onPointerUp);
    canvas.removeEventListener('pointercancel', this.onPointerCancel);
    canvas.removeEventListener('webglcontextlost', this.onContextLost);
    canvas.removeEventListener('webglcontextrestored', this.onContextRestored);
    const materials = new Set<THREE.Material>();
    const geometries = new Set<THREE.BufferGeometry>();
    const textures = new Set<THREE.Texture>();
    this.world.traverse(object => {
      if (object instanceof THREE.Mesh) {
        geometries.add(object.geometry);
        (Array.isArray(object.material) ? object.material : [object.material]).forEach(mat => materials.add(mat));
      } else if (object instanceof THREE.Sprite) materials.add(object.material);
    });
    materials.forEach(mat => {
      if ('map' in mat && mat.map instanceof THREE.Texture) textures.add(mat.map);
      mat.dispose();
    });
    geometries.forEach(geometry => geometry.dispose());
    textures.forEach(texture => texture.dispose());
    this.renderer.dispose();
    canvas.remove();
    if (this.action) { this.action.reject(new Error('3D 場景已關閉。')); this.action = null; }
  }
}
