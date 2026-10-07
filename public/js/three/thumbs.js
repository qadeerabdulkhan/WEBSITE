// Renders studio "photos" of procedural bottles with a single offscreen WebGL context,
// so product grids show 3D-rendered bottles without one live canvas per card.
import { THREE, studioEnvironment, webglAvailable } from './core.js';
import { makeBottle } from './bottle.js';
import { addStudioLights, radialTexture } from './fx.js';
import { loadLogoFonts } from '../logo.js';

const W = 480;
const H = 600;
const memo = new Map();
let ctx = null;
let queue = Promise.resolve();

function setup() {
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
  renderer.setSize(W, H, false);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;
  const scene = new THREE.Scene();
  scene.environment = studioEnvironment(renderer);
  addStudioLights(scene);
  const camera = new THREE.PerspectiveCamera(30, W / H, 0.1, 50);
  return { renderer, scene, camera };
}

function backdrop(tint) {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 80;
  const g = c.getContext('2d');
  const col = new THREE.Color(tint);
  const mid = `rgb(${Math.round(col.r * 70 + 22)},${Math.round(col.g * 60 + 19)},${Math.round(col.b * 50 + 16)})`;
  const grd = g.createRadialGradient(32, 30, 2, 32, 40, 52);
  grd.addColorStop(0, mid);
  grd.addColorStop(1, '#070605');
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 80);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function key(product) {
  const b = product.bottle || {};
  return `${b.shape}|${b.liquid}|${b.cap}|${product.name}`;
}

export function bottleThumb(product) {
  if (!webglAvailable()) return Promise.resolve(null);
  const k = key(product);
  if (memo.has(k)) return memo.get(k);
  try {
    const cached = sessionStorage.getItem(`zq_thumb:${k}`);
    if (cached) {
      const p = Promise.resolve(cached);
      memo.set(k, p);
      return p;
    }
  } catch {
    // sessionStorage unavailable.
  }
  const p = (queue = queue.then(async () => {
    await loadLogoFonts();
    ctx ||= setup();
    const { renderer, scene, camera } = ctx;
    const bottle = makeBottle(product.bottle, { quality: 'high', name: product.name, sub: `${product.sizeMl || 100} ML` });
    const h = bottle.userData.height;
    bottle.rotation.y = -0.38;
    scene.add(bottle);
    const bg = backdrop(product.bottle?.liquid || '#c9a96e');
    scene.background = bg;
    const glow = new THREE.Mesh(
      new THREE.PlaneGeometry(6, 6),
      new THREE.MeshBasicMaterial({ map: radialTexture('rgba(201,169,110,0.45)', 'rgba(0,0,0,0)'), transparent: true, depthWrite: false })
    );
    glow.rotation.x = -Math.PI / 2;
    scene.add(glow);
    const dist = 3.2 + h * 1.9;
    camera.position.set(0, h * 0.62, dist);
    camera.lookAt(0, h * 0.47, 0);
    renderer.render(scene, camera);
    const url = renderer.domElement.toDataURL('image/jpeg', 0.86);
    scene.remove(bottle, glow);
    bottle.userData.dispose();
    glow.geometry.dispose();
    glow.material.map.dispose();
    glow.material.dispose();
    bg.dispose();
    try {
      sessionStorage.setItem(`zq_thumb:${k}`, url);
    } catch {
      // Storage full: keep in memory only.
    }
    return url;
  }));
  memo.set(k, p);
  return p;
}

// Fills every <img data-thumb> inside root with its rendered bottle (unless it already has a photo).
export function hydrateThumbs(root, productsBySlug) {
  for (const img of root.querySelectorAll('img[data-thumb]')) {
    const p = productsBySlug.get(img.dataset.thumb);
    if (!p || p.imageUrl) continue;
    bottleThumb(p).then((url) => {
      if (url) {
        img.src = url;
        img.closest('.media')?.classList.remove('skeleton');
      }
    });
  }
}
