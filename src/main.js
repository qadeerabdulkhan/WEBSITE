import * as THREE from 'three';

const canvas = document.getElementById('scene');
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// Distance between the 3D objects along the Y axis, one per page section.
const SECTION_SPACING = 6;

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setClearColor(0x07060f);
renderer.toneMapping = THREE.ACESFilmicToneMapping;

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x07060f, 0.045);

const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.z = 9;
const cameraRig = new THREE.Group();
cameraRig.add(camera);
scene.add(cameraRig);

// ---------- Lights ----------
scene.add(new THREE.AmbientLight(0xffffff, 0.35));
const keyLight = new THREE.PointLight(0x8b5cf6, 60, 40);
keyLight.position.set(4, 3, 6);
cameraRig.add(keyLight);
const rimLight = new THREE.PointLight(0x22d3ee, 50, 40);
rimLight.position.set(-5, -2, 4);
cameraRig.add(rimLight);

// ---------- Section 0: noise-displaced shader orb ----------
const noiseGLSL = /* glsl */ `
  // Ashima Arts 3D simplex noise (MIT)
  vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec4 permute(vec4 x) { return mod289(((x * 34.0) + 1.0) * x); }
  vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }
  float snoise(vec3 v) {
    const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
    const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
    vec3 i = floor(v + dot(v, C.yyy));
    vec3 x0 = v - i + dot(i, C.xxx);
    vec3 g = step(x0.yzx, x0.xyz);
    vec3 l = 1.0 - g;
    vec3 i1 = min(g.xyz, l.zxy);
    vec3 i2 = max(g.xyz, l.zxy);
    vec3 x1 = x0 - i1 + C.xxx;
    vec3 x2 = x0 - i2 + C.yyy;
    vec3 x3 = x0 - D.yyy;
    i = mod289(i);
    vec4 p = permute(permute(permute(
      i.z + vec4(0.0, i1.z, i2.z, 1.0))
      + i.y + vec4(0.0, i1.y, i2.y, 1.0))
      + i.x + vec4(0.0, i1.x, i2.x, 1.0));
    float n_ = 0.142857142857;
    vec3 ns = n_ * D.wyz - D.xzx;
    vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
    vec4 x_ = floor(j * ns.z);
    vec4 y_ = floor(j - 7.0 * x_);
    vec4 x = x_ * ns.x + ns.yyyy;
    vec4 y = y_ * ns.x + ns.yyyy;
    vec4 h = 1.0 - abs(x) - abs(y);
    vec4 b0 = vec4(x.xy, y.xy);
    vec4 b1 = vec4(x.zw, y.zw);
    vec4 s0 = floor(b0) * 2.0 + 1.0;
    vec4 s1 = floor(b1) * 2.0 + 1.0;
    vec4 sh = -step(h, vec4(0.0));
    vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
    vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
    vec3 p0 = vec3(a0.xy, h.x);
    vec3 p1 = vec3(a0.zw, h.y);
    vec3 p2 = vec3(a1.xy, h.z);
    vec3 p3 = vec3(a1.zw, h.w);
    vec4 norm = taylorInvSqrt(vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
    p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
    vec4 m = max(0.6 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);
    m = m * m;
    return 42.0 * dot(m * m, vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
  }
`;

const palettes = [
  [new THREE.Color('#8b5cf6'), new THREE.Color('#22d3ee')],
  [new THREE.Color('#f43f5e'), new THREE.Color('#f59e0b')],
  [new THREE.Color('#10b981'), new THREE.Color('#3b82f6')],
  [new THREE.Color('#ec4899'), new THREE.Color('#a78bfa')],
];
let paletteIndex = 0;

const orbUniforms = {
  uTime: { value: 0 },
  uIntensity: { value: 0.35 },
  uColorA: { value: palettes[0][0].clone() },
  uColorB: { value: palettes[0][1].clone() },
};

const orb = new THREE.Mesh(
  new THREE.IcosahedronGeometry(1.6, 64),
  new THREE.ShaderMaterial({
    uniforms: orbUniforms,
    vertexShader: /* glsl */ `
      uniform float uTime;
      uniform float uIntensity;
      varying vec3 vNormal;
      varying vec3 vView;
      varying float vNoise;
      ${noiseGLSL}
      void main() {
        float n = snoise(normal * 1.4 + uTime * 0.35);
        vNoise = n;
        vec3 displaced = position + normal * n * uIntensity;
        vec4 mv = modelViewMatrix * vec4(displaced, 1.0);
        vNormal = normalize(normalMatrix * normal);
        vView = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uColorA;
      uniform vec3 uColorB;
      varying vec3 vNormal;
      varying vec3 vView;
      varying float vNoise;
      void main() {
        float fresnel = pow(1.0 - max(dot(vNormal, vView), 0.0), 2.5);
        vec3 col = mix(uColorA, uColorB, smoothstep(-0.6, 0.6, vNoise));
        col = col * (0.35 + 0.65 * (vNoise * 0.5 + 0.5)) + fresnel * 1.2;
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  })
);

const orbRing = new THREE.Mesh(
  new THREE.TorusGeometry(2.6, 0.015, 16, 200),
  new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.35 })
);
orbRing.rotation.x = Math.PI * 0.42;
const orbRing2 = orbRing.clone();
orbRing2.scale.setScalar(1.18);
orbRing2.rotation.set(Math.PI * 0.6, 0.3, 0);

const heroGroup = new THREE.Group();
heroGroup.add(orb, orbRing, orbRing2);

// ---------- Section 1: metallic torus knot ----------
const knot = new THREE.Mesh(
  new THREE.TorusKnotGeometry(1.1, 0.36, 220, 32),
  new THREE.MeshStandardMaterial({ color: 0xb8b5ff, metalness: 0.85, roughness: 0.18 })
);
const knotWire = new THREE.Mesh(
  knot.geometry,
  new THREE.MeshBasicMaterial({ color: 0x22d3ee, wireframe: true, transparent: true, opacity: 0.08 })
);
knotWire.scale.setScalar(1.12);
const workGroup = new THREE.Group();
workGroup.add(knot, knotWire);

// ---------- Section 2: floating cube cluster ----------
const CUBE_COUNT = 140;
const cubes = new THREE.InstancedMesh(
  new THREE.BoxGeometry(0.22, 0.22, 0.22),
  new THREE.MeshStandardMaterial({ metalness: 0.4, roughness: 0.3 }),
  CUBE_COUNT
);
const cubeData = [];
const dummy = new THREE.Object3D();
const tmpColor = new THREE.Color();
for (let i = 0; i < CUBE_COUNT; i++) {
  // Fibonacci sphere distribution with some radial jitter.
  const t = i / CUBE_COUNT;
  const phi = Math.acos(1 - 2 * t);
  const theta = Math.PI * (1 + Math.sqrt(5)) * i;
  const r = 1.4 + Math.random() * 0.7;
  cubeData.push({
    base: new THREE.Vector3().setFromSphericalCoords(r, phi, theta),
    spin: new THREE.Vector3(Math.random(), Math.random(), Math.random()).multiplyScalar(2),
    phase: Math.random() * Math.PI * 2,
  });
  tmpColor.setHSL(0.68 + Math.random() * 0.22, 0.75, 0.6);
  cubes.setColorAt(i, tmpColor);
}
const aboutGroup = new THREE.Group();
aboutGroup.add(cubes);

// ---------- Section 3: crystal ----------
const crystalOuter = new THREE.Mesh(
  new THREE.IcosahedronGeometry(1.7, 1),
  new THREE.MeshBasicMaterial({ color: 0x8b5cf6, wireframe: true, transparent: true, opacity: 0.6 })
);
const crystalInner = new THREE.Mesh(
  new THREE.OctahedronGeometry(0.9, 0),
  new THREE.MeshStandardMaterial({
    color: 0x22d3ee,
    emissive: 0x0e7490,
    emissiveIntensity: 0.8,
    metalness: 0.3,
    roughness: 0.2,
    flatShading: true,
  })
);
const contactGroup = new THREE.Group();
contactGroup.add(crystalOuter, crystalInner);

// Text alternates left/right, so objects alternate on the opposite side.
const sections = [
  { group: heroGroup, side: 1 },
  { group: workGroup, side: -1 },
  { group: aboutGroup, side: 1 },
  { group: contactGroup, side: -1 },
];
sections.forEach(({ group }, i) => {
  group.position.y = -i * SECTION_SPACING;
  scene.add(group);
});

// ---------- Starfield ----------
const STAR_COUNT = 2500;
const starPositions = new Float32Array(STAR_COUNT * 3);
const starSpan = SECTION_SPACING * sections.length + 10;
for (let i = 0; i < STAR_COUNT; i++) {
  starPositions[i * 3] = (Math.random() - 0.5) * 40;
  starPositions[i * 3 + 1] = 5 - Math.random() * starSpan;
  starPositions[i * 3 + 2] = (Math.random() - 0.5) * 30 - 4;
}
const starGeometry = new THREE.BufferGeometry();
starGeometry.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
const stars = new THREE.Points(
  starGeometry,
  new THREE.PointsMaterial({ color: 0xcfc8ff, size: 0.05, sizeAttenuation: true, transparent: true, opacity: 0.85 })
);
scene.add(stars);

// ---------- Layout ----------
function layout() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);

  // Half the visible width at the objects' depth, used to push them beside the text.
  const halfWidth = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.position.z * camera.aspect;
  const narrow = w < 720;
  sections.forEach(({ group, side }, i) => {
    group.position.x = narrow ? 0 : side * halfWidth * 0.45;
    // On phones the text sits at the bottom, so lift objects into the top half.
    group.position.y = -i * SECTION_SPACING + (narrow ? 1.9 : 0);
    group.scale.setScalar(narrow ? 0.6 : 1);
  });
}
layout();
window.addEventListener('resize', layout);

// ---------- Input ----------
// Maps scroll position to a fractional section index using the real section
// offsets, so the camera stays in sync even when a section is taller than the viewport.
const sectionEls = [...document.querySelectorAll('main > .section')];
function scrollProgress() {
  const y = window.scrollY;
  for (let i = sectionEls.length - 1; i >= 0; i--) {
    const top = sectionEls[i].offsetTop;
    if (y >= top) {
      const next = sectionEls[i + 1];
      if (!next) return i;
      return i + (y - top) / (next.offsetTop - top);
    }
  }
  return 0;
}

const pointer = new THREE.Vector2();
window.addEventListener('pointermove', (e) => {
  pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
  pointer.y = -(e.clientY / window.innerHeight) * 2 + 1;
});

// Clicking the orb cycles its colour palette.
const raycaster = new THREE.Raycaster();
const targetColors = { a: palettes[0][0].clone(), b: palettes[0][1].clone() };
let orbPulse = 0;
window.addEventListener('click', (e) => {
  if (e.target.closest('a, button')) return;
  const ndc = new THREE.Vector2(
    (e.clientX / window.innerWidth) * 2 - 1,
    -(e.clientY / window.innerHeight) * 2 + 1
  );
  raycaster.setFromCamera(ndc, camera);
  if (raycaster.intersectObject(orb).length) {
    paletteIndex = (paletteIndex + 1) % palettes.length;
    targetColors.a.copy(palettes[paletteIndex][0]);
    targetColors.b.copy(palettes[paletteIndex][1]);
    orbPulse = 1;
  }
});

let hovering = false;
function updateHover() {
  raycaster.setFromCamera(pointer, camera);
  const hit = raycaster.intersectObject(orb).length > 0;
  if (hit !== hovering) {
    hovering = hit;
    document.body.style.cursor = hit ? 'pointer' : '';
  }
}

// ---------- Animation loop ----------
const clock = new THREE.Clock();
let prevTime = 0;
const motion = reducedMotion ? 0.15 : 1;

function tick() {
  const elapsed = clock.getElapsedTime();
  const dt = Math.min(elapsed - prevTime, 0.1);
  prevTime = elapsed;
  const t = elapsed * motion;

  // Camera follows scroll, one section of scroll = one object.
  const targetY = -scrollProgress() * SECTION_SPACING;
  cameraRig.position.y += (targetY - cameraRig.position.y) * Math.min(dt * 6, 1);

  // Pointer parallax.
  const px = pointer.x * 0.6 * motion;
  const py = pointer.y * 0.4 * motion;
  camera.position.x += (px - camera.position.x) * Math.min(dt * 3, 1);
  camera.position.y += (py - camera.position.y) * Math.min(dt * 3, 1);
  camera.lookAt(cameraRig.position.x, cameraRig.position.y, 0);

  // Orb.
  orbUniforms.uTime.value = t;
  orbPulse = Math.max(orbPulse - dt * 1.5, 0);
  const targetIntensity = (hovering ? 0.55 : 0.35) + orbPulse * 0.5;
  orbUniforms.uIntensity.value += (targetIntensity - orbUniforms.uIntensity.value) * Math.min(dt * 5, 1);
  orbUniforms.uColorA.value.lerp(targetColors.a, Math.min(dt * 4, 1));
  orbUniforms.uColorB.value.lerp(targetColors.b, Math.min(dt * 4, 1));
  orb.rotation.y = t * 0.15;
  orbRing.rotation.z = t * 0.25;
  orbRing2.rotation.z = -t * 0.18;

  // Torus knot.
  workGroup.rotation.x = t * 0.2;
  workGroup.rotation.y = t * 0.3;

  // Cube cluster.
  aboutGroup.rotation.y = t * 0.15;
  for (let i = 0; i < CUBE_COUNT; i++) {
    const d = cubeData[i];
    const breathe = 1 + Math.sin(t * 1.2 + d.phase) * 0.08;
    dummy.position.copy(d.base).multiplyScalar(breathe);
    dummy.rotation.set(d.spin.x * t, d.spin.y * t, d.spin.z * t);
    dummy.updateMatrix();
    cubes.setMatrixAt(i, dummy.matrix);
  }
  cubes.instanceMatrix.needsUpdate = true;

  // Crystal.
  crystalOuter.rotation.x = t * 0.2;
  crystalOuter.rotation.y = -t * 0.25;
  crystalInner.rotation.y = t * 0.8;
  crystalInner.position.y = Math.sin(t * 1.5) * 0.15;

  stars.rotation.y = t * 0.01;

  updateHover();
  renderer.render(scene, camera);
  requestAnimationFrame(tick);
}
tick();

document.getElementById('year').textContent = new Date().getFullYear();
