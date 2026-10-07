// Shared WebGL stage: renderer, cinematic studio lighting, optional bloom, and a render loop
// that pauses when the canvas is off-screen or the tab is hidden.
import * as THREE from '../../vendor/three/three.module.min.js';
import { EffectComposer } from '../../vendor/three/addons/EffectComposer.js';
import { RenderPass } from '../../vendor/three/addons/RenderPass.js';
import { UnrealBloomPass } from '../../vendor/three/addons/UnrealBloomPass.js';
import { OutputPass } from '../../vendor/three/addons/OutputPass.js';

export { THREE };

export const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

export function webglAvailable() {
  try {
    const c = document.createElement('canvas');
    return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl')));
  } catch {
    return false;
  }
}

// A dark studio with soft-box strips, used as the reflection map so glass and metal catch light streaks.
export function studioEnvironment(renderer) {
  const env = new THREE.Scene();
  env.background = new THREE.Color(0x050403);
  const box = new THREE.Mesh(new THREE.BoxGeometry(20, 20, 20), new THREE.MeshBasicMaterial({ color: 0x0b0907, side: THREE.BackSide }));
  env.add(box);
  const panel = (w, h, color, intensity, pos, rot) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(intensity), side: THREE.DoubleSide }));
    m.position.set(...pos);
    m.rotation.set(...rot);
    env.add(m);
  };
  panel(1.2, 12, 0xfff1d8, 6, [-5, 0, 2], [0, Math.PI / 2, 0]); // left strip
  panel(1.2, 12, 0xfff7ea, 5, [5, 0, 1], [0, -Math.PI / 2, 0]); // right strip
  panel(8, 2, 0xffe2b0, 3, [0, 8, 0], [Math.PI / 2, 0, 0]); // top soft-box
  panel(6, 6, 0xc9a96e, 0.6, [0, 0, -9], [0, 0, 0]); // warm back wash
  panel(3, 3, 0xffffff, 2.5, [3, 3, 7], [0, Math.PI, 0]); // front key
  const pmrem = new THREE.PMREMGenerator(renderer);
  const tex = pmrem.fromScene(env, 0.03).texture;
  pmrem.dispose();
  return tex;
}

export function createStage(canvas, opts = {}) {
  const {
    bloom = false,
    bloomStrength = 0.6,
    bloomRadius = 0.7,
    bloomThreshold = 0.82,
    fov = 35,
    background = 0x0a0908,
    exposure = 1.05,
    maxDpr = 1.75,
    fog = null,
  } = opts;

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: !bloom, alpha: background === null, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, maxDpr));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = exposure;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  if (background !== null) scene.background = new THREE.Color(background);
  if (fog) scene.fog = new THREE.FogExp2(fog.color ?? background ?? 0x0a0908, fog.density ?? 0.06);
  scene.environment = studioEnvironment(renderer);

  const camera = new THREE.PerspectiveCamera(fov, 1, 0.1, 100);

  let composer = null;
  let bloomPass = null;
  if (bloom) {
    composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    bloomPass = new UnrealBloomPass(new THREE.Vector2(256, 256), bloomStrength, bloomRadius, bloomThreshold);
    composer.addPass(bloomPass);
    composer.addPass(new OutputPass());
  }

  const size = { w: 1, h: 1 };
  function resize() {
    const w = canvas.clientWidth || canvas.parentElement?.clientWidth || innerWidth;
    const h = canvas.clientHeight || canvas.parentElement?.clientHeight || innerHeight;
    if (w === size.w && h === size.h) return;
    size.w = w;
    size.h = h;
    renderer.setSize(w, h, false);
    composer?.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    stage.onResize?.(size);
  }

  const frameFns = [];
  const clock = new THREE.Clock();
  let visible = true;
  let running = false;
  let elapsed = 0;

  function frame() {
    if (!running) return;
    requestAnimationFrame(frame);
    if (!visible || document.hidden) {
      clock.getDelta();
      return;
    }
    resize();
    const dt = Math.min(clock.getDelta(), 0.05);
    elapsed += dt * (reducedMotion ? 0.2 : 1);
    for (const fn of frameFns) fn(elapsed, dt);
    if (composer) composer.render(dt);
    else renderer.render(scene, camera);
  }

  const io = new IntersectionObserver((entries) => (visible = entries[0].isIntersecting), { threshold: 0 });
  io.observe(canvas);

  const stage = {
    THREE,
    renderer,
    scene,
    camera,
    composer,
    bloomPass,
    size,
    resize,
    onResize: null,
    onFrame(fn) {
      frameFns.push(fn);
    },
    start() {
      if (running) return;
      running = true;
      resize();
      clock.start();
      frame();
    },
  };
  return stage;
}

// Normalised pointer position (-1..1), smoothed, shared by all scenes.
export const pointer = { x: 0, y: 0, tx: 0, ty: 0 };
addEventListener(
  'pointermove',
  (e) => {
    pointer.tx = (e.clientX / innerWidth) * 2 - 1;
    pointer.ty = -(e.clientY / innerHeight) * 2 + 1;
  },
  { passive: true }
);
export function updatePointer(dt) {
  const k = Math.min(dt * 3, 1);
  pointer.x += (pointer.tx - pointer.x) * k;
  pointer.y += (pointer.ty - pointer.y) * k;
}

// Marks <html> when WebGL is unavailable so pages can fall back gracefully.
export function guardWebGL() {
  if (!webglAvailable()) {
    document.documentElement.classList.add('webgl-fallback');
    return false;
  }
  return true;
}
