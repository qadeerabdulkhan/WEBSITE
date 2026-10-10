// Renders studio "product photos" of the procedural bottles with a single offscreen WebGL
// context: a seamless studio sweep with a warm back light, a contact shadow and rim lights that
// trace the glass edges, so product grids look photographed without one live canvas per card.
import { THREE, studioEnvironment, webglAvailable } from './core.js';
import { makeBottle } from './bottle.js';
import { loadLogoFonts } from '../logo.js';
import { thumbKey } from '../swatch.js';

const W = 720;
const H = 900;
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
  renderer.toneMappingExposure = 1.15;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene();
  scene.environment = studioEnvironment(renderer);
  // Key light from the upper left, two rim lights behind to outline the glass, a soft fill.
  const key = new THREE.SpotLight(0xfff1dc, 60, 30, Math.PI / 6, 0.7, 1.4);
  key.position.set(-3.5, 6, 5);
  scene.add(key, key.target);
  const rimL = new THREE.DirectionalLight(0xffffff, 2.2);
  rimL.position.set(-4, 2, -5);
  const rimR = new THREE.DirectionalLight(0xffe8c8, 2.2);
  rimR.position.set(4, 2.5, -5);
  scene.add(rimL, rimR, new THREE.AmbientLight(0xffffff, 0.15));
  const camera = new THREE.PerspectiveCamera(26, W / H, 0.1, 60);

  scene.add(cyclorama());
  return { renderer, scene, camera };
}

// A seamless studio sweep (floor curving up into a back wall), like a product photography set.
// A warm glow is painted onto the wall behind the bottle as an emissive "back light": it shows
// through the glass and juice the way a lit backdrop does in a real perfume shot.
function cyclorama() {
  const floorLen = 8;
  const radius = 2.2;
  const wallLen = 9;
  const arc = (Math.PI / 2) * radius;
  const total = floorLen + arc + wallLen;
  const geo = new THREE.PlaneGeometry(24, total, 1, 160);
  const pos = geo.attributes.position;
  const uv = geo.attributes.uv;
  for (let i = 0; i < pos.count; i++) {
    const s = (1 - uv.getY(i)) * total; // distance along the sweep from the front edge
    let y;
    let z;
    if (s <= floorLen) {
      y = 0;
      z = 5 - s;
    } else if (s <= floorLen + arc) {
      const a = (s - floorLen) / radius;
      y = radius - Math.cos(a) * radius;
      z = 5 - floorLen - Math.sin(a) * radius;
    } else {
      y = radius + (s - floorLen - arc);
      z = 5 - floorLen - radius;
    }
    pos.setXYZ(i, pos.getX(i), y, z);
  }
  geo.computeVertexNormals();
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 512;
  const g = c.getContext('2d');
  g.fillStyle = '#000';
  g.fillRect(0, 0, 256, 512);
  const vy = (1 - (floorLen + radius * 1.15) / total) * 512; // glow centre: on the bend, right behind the bottle
  const glow = g.createRadialGradient(128, vy, 2, 128, vy, 78);
  glow.addColorStop(0, 'rgba(255,236,205,1)');
  glow.addColorStop(0.35, 'rgba(201,160,105,0.55)');
  glow.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = glow;
  g.save();
  g.translate(128, vy);
  g.scale(1, 1.25);
  g.translate(-128, -vy);
  g.fillRect(0, 0, 256, 512);
  g.restore();
  const emissive = new THREE.CanvasTexture(c);
  emissive.colorSpace = THREE.SRGBColorSpace;
  const mesh = new THREE.Mesh(
    geo,
    new THREE.MeshStandardMaterial({ color: 0x2a231c, roughness: 0.92, metalness: 0, emissive: 0xffffff, emissiveMap: emissive, emissiveIntensity: 0.9, side: THREE.DoubleSide })
  );
  mesh.userData.emissive = emissive;
  return mesh;
}

function render(product) {
  const { renderer, scene, camera } = (ctx ||= setup());
  const opts = { quality: 'high', name: product.name, sub: product.concentration || 'Eau de Parfum', size: `${product.sizeMl || 100} ml` };
  const bottle = makeBottle(product.bottle, opts);
  const h = bottle.userData.height;
  bottle.rotation.y = -0.42;
  scene.add(bottle);
  const dist = 3.4 + h * 2.1;
  camera.position.set(0.35, h * 0.55, dist);
  camera.lookAt(0, h * 0.45, 0);
  renderer.render(scene, camera);
  const url = renderer.domElement.toDataURL('image/jpeg', 0.88);
  scene.remove(bottle);
  bottle.userData.dispose();
  return url;
}

export function bottleThumb(product) {
  if (!webglAvailable()) return Promise.resolve(null);
  const k = thumbKey(product);
  if (memo.has(k)) return memo.get(k);
  try {
    const cached = sessionStorage.getItem(k);
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
    const url = render(product);
    try {
      sessionStorage.setItem(k, url);
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
