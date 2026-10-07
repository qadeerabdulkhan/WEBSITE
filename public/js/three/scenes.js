// Page-level 3D scenes. Each takes a <canvas> and returns a small controller object.
import { THREE, createStage, pointer, updatePointer, reducedMotion } from './core.js';
import { OrbitControls } from '../../vendor/three/addons/OrbitControls.js';
import { makeBottle } from './bottle.js';
import { makeDust, makeLightShaft, makePedestal, addStudioLights } from './fx.js';
import { loadLogoFonts, drawLogo } from '../logo.js';

const ease = (t) => 1 - Math.pow(1 - Math.min(Math.max(t, 0), 1), 3);
const isNarrow = () => innerWidth < 860;
// Pull the camera back on tall/narrow screens so subjects keep the same framing.
const fit = (camera, ref = 1.5) => Math.pow(Math.max(1, ref / camera.aspect), 0.9);

/* ------------------------------------------------------------------ */
/* Home hero: signature bottle, light shaft, halo and a dolly-in intro */
/* ------------------------------------------------------------------ */
export async function heroScene(canvas, { product } = {}) {
  await loadLogoFonts();
  const stage = createStage(canvas, { bloom: true, bloomStrength: 0.7, bloomThreshold: 0.78, fov: 30, fog: { density: 0.045 } });
  const { scene, camera } = stage;
  addStudioLights(scene);

  const rig = new THREE.Group();
  scene.add(rig);
  const pedestal = makePedestal({ radius: 1.6 });
  rig.add(pedestal);

  const bottle = makeBottle(product?.bottle || { shape: 'classic', liquid: '#c9a24d', cap: '#c9a96e' }, {
    quality: 'high',
    name: product?.name || 'ZAQA Signature',
    sub: 'EXTRAIT DE PARFUM',
  });
  const bh = bottle.userData.height;
  const holder = new THREE.Group();
  holder.add(bottle);
  holder.position.y = 0.05;
  rig.add(holder);

  // Gold halo rings behind the bottle catch the bloom.
  const haloMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xe8c890).multiplyScalar(1.6), transparent: true, opacity: 0.85 });
  const halo = new THREE.Mesh(new THREE.TorusGeometry(2.25, 0.008, 8, 220), haloMat);
  halo.position.set(0, bh * 0.55, -1.2);
  rig.add(halo);
  const halo2 = new THREE.Mesh(new THREE.TorusGeometry(2.7, 0.004, 8, 220), haloMat.clone());
  halo2.material.opacity = 0.35;
  halo2.position.copy(halo.position);
  rig.add(halo2);

  const shaft = makeLightShaft({ height: 10, radiusBottom: 2.4, intensity: 0.32 });
  shaft.position.set(0, 9.5, 0);
  rig.add(shaft);
  const dust = makeDust({ count: 900, spread: [16, 10, 10], y: 2 });
  scene.add(dust);

  const look = new THREE.Vector3();
  const from = new THREE.Vector3(0.3, 0.7, 4.2);
  const to = new THREE.Vector3(0, 1.8, 10.5);
  const INTRO = reducedMotion ? 0.01 : 4.2;
  const started = performance.now();

  function layout() {
    if (isNarrow()) {
      rig.position.set(0, 2.1, 0);
      rig.scale.setScalar(0.95);
    } else {
      rig.position.set(2.15, 0, 0);
      rig.scale.setScalar(1);
    }
  }
  layout();
  stage.onResize = layout;

  stage.onFrame((t, dt) => {
    updatePointer(dt);
    // Intro runs on wall-clock time so it finishes on schedule even on slow devices.
    const intro = ease((performance.now() - started) / 1000 / INTRO);
    const scroll = Math.min(scrollY / innerHeight, 2);
    camera.position.lerpVectors(from, to, intro);
    camera.position.multiplyScalar(1 + (fit(camera, 0.95) - 1) * intro);
    camera.position.x += pointer.x * 0.5 + rig.position.x * 0.25 * intro;
    camera.position.y += pointer.y * 0.3 + scroll * 1.2;
    camera.position.z += scroll * 1.5;
    look.set(rig.position.x * 0.55 * intro, (isNarrow() ? 0.9 : 1.35) + rig.position.y * 0.6 - scroll * 0.4, 0);
    camera.lookAt(look);

    holder.rotation.y = -0.5 + t * 0.22 + scroll * Math.PI * 0.9;
    holder.position.y = 0.08 + Math.sin(t * 1.1) * 0.06;
    halo.rotation.z = t * 0.1;
    halo2.rotation.z = -t * 0.06;
    halo.rotation.x = Math.sin(t * 0.3) * 0.12;
    shaft.userData.update(t);
    dust.userData.update(t);
    stage.bloomPass.strength = 0.45 + intro * 0.35;
  });
  stage.start();
  return stage;
}

/* ------------------------------------------------------------------ */
/* Categories: a rotating ring of bottles, one per category           */
/* ------------------------------------------------------------------ */
const SHAPES = ['classic', 'round', 'tall', 'flask', 'oud', 'mist'];

export async function carouselScene(canvas, categories, { onChange, onOpen } = {}) {
  await loadLogoFonts();
  const stage = createStage(canvas, { bloom: true, bloomStrength: 0.55, fov: 34, fog: { density: 0.05 } });
  const { scene, camera, renderer } = stage;
  addStudioLights(scene, { spot: false });

  const n = categories.length;
  const R = Math.max(3.4, n * 0.62);
  const ring = new THREE.Group();
  scene.add(ring);

  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(R + 4, 96),
    new THREE.MeshPhysicalMaterial({ color: 0x0b0908, metalness: 0.6, roughness: 0.28, clearcoat: 1, clearcoatRoughness: 0.2 })
  );
  floor.rotation.x = -Math.PI / 2;
  scene.add(floor);

  const items = categories.map((c, i) => {
    const b = makeBottle(
      { shape: SHAPES[i % SHAPES.length], liquid: c.color, cap: i % 3 === 1 ? '#1a1a1a' : '#c9a96e' },
      { quality: 'low', name: c.name, sub: 'ZAQA' }
    );
    const a = (i / n) * Math.PI * 2;
    const holder = new THREE.Group();
    holder.position.set(Math.sin(a) * R, 0, Math.cos(a) * R);
    holder.add(b);
    holder.userData = { index: i, angle: a };
    ring.add(holder);
    const glow = new THREE.PointLight(new THREE.Color(c.color), 0, 4, 2);
    glow.position.set(0, 1.2, 0.8);
    holder.add(glow);
    return { holder, bottle: b, glow };
  });

  const shaft = makeLightShaft({ height: 9, radiusBottom: 1.9, intensity: 0.4 });
  shaft.position.set(0, 9, R);
  scene.add(shaft);
  const dust = makeDust({ count: 700, spread: [R * 3, 8, R * 3], y: 2.5 });
  scene.add(dust);

  let index = 0;
  let current = 0; // smoothed ring angle
  let lastInteraction = 0;

  function go(i, user = true) {
    index = ((i % n) + n) % n;
    if (user) lastInteraction = performance.now();
    onChange?.(index);
  }

  // Drag to rotate.
  let dragging = false;
  let dragX = 0;
  let dragDelta = 0;
  let moved = 0;
  canvas.addEventListener('pointerdown', (e) => {
    dragging = true;
    dragX = e.clientX;
    dragDelta = 0;
    moved = 0;
  });
  addEventListener('pointerup', () => {
    if (!dragging) return;
    dragging = false;
    if (Math.abs(dragDelta) > 40) go(index + (dragDelta < 0 ? 1 : -1));
  });
  addEventListener('pointermove', (e) => {
    if (!dragging) return;
    dragDelta = e.clientX - dragX;
    moved = Math.max(moved, Math.abs(dragDelta));
  });

  // Click: front bottle opens the category, others rotate into view.
  const ray = new THREE.Raycaster();
  canvas.addEventListener('click', (e) => {
    if (moved > 6) return;
    const r = canvas.getBoundingClientRect();
    const v = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(v, camera);
    const hit = ray.intersectObjects(items.map((it) => it.holder), true)[0];
    if (!hit) return;
    let o = hit.object;
    while (o && o.userData.index === undefined) o = o.parent;
    if (!o) return;
    if (o.userData.index === index) onOpen?.(index);
    else go(o.userData.index);
  });
  canvas.addEventListener('pointermove', (e) => {
    const r = canvas.getBoundingClientRect();
    const v = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(v, camera);
    canvas.style.cursor = ray.intersectObjects(items.map((it) => it.holder), true).length ? 'pointer' : 'grab';
  });

  stage.onFrame((t, dt) => {
    updatePointer(dt);
    if (!reducedMotion && performance.now() - lastInteraction > 7000 && Math.floor(t) % 5 === 0 && t - Math.floor(t) < dt) go(index + 1, false);
    // Rotate the ring so the active bottle faces the camera, taking the short way round.
    let target = -(index / n) * Math.PI * 2 + (dragging ? dragDelta * 0.003 : 0);
    while (target - current > Math.PI) target -= Math.PI * 2;
    while (target - current < -Math.PI) target += Math.PI * 2;
    current += (target - current) * Math.min(dt * 3.2, 1);
    ring.rotation.y = current;

    const d = 9.5 * fit(camera, 1.6);
    camera.position.set(pointer.x * 0.6, 2.4 + d * 0.12 + pointer.y * 0.3, R + d);
    camera.lookAt(0, 0.85 - d * 0.04, R - 1);

    items.forEach((it, i) => {
      const active = i === index;
      const s = it.holder.scale.x + ((active ? 1.25 : 0.88) - it.holder.scale.x) * Math.min(dt * 4, 1);
      it.holder.scale.setScalar(s);
      it.bottle.rotation.y = -ring.rotation.y - it.holder.userData.angle + Math.sin(t * 0.7 + i) * 0.25 + (active ? t * 0.4 : 0);
      it.holder.position.y = active ? 0.15 + Math.sin(t * 1.4) * 0.06 : 0;
      it.glow.intensity += ((active ? 6 : 0) - it.glow.intensity) * Math.min(dt * 3, 1);
    });
    shaft.userData.update(t);
    dust.userData.update(t);
  });

  renderer.domElement.setAttribute('tabindex', '0');
  stage.start();
  return { stage, go: (i) => go(i), next: () => go(index + 1), prev: () => go(index - 1), get index() { return index; } };
}

/* ------------------------------------------------------------------ */
/* Floating bottles for page banners (shop, account)                  */
/* ------------------------------------------------------------------ */
export async function floatingScene(canvas, { colors = ['#c9a24d'], count = 6, names = [] } = {}) {
  await loadLogoFonts();
  const stage = createStage(canvas, { bloom: true, bloomStrength: 0.5, fov: 36, fog: { density: 0.075 }, maxDpr: 1.5 });
  const { scene, camera } = stage;
  addStudioLights(scene, { spot: false });
  const bottles = [];
  for (let i = 0; i < count; i++) {
    const b = makeBottle(
      { shape: SHAPES[(i * 2 + 1) % SHAPES.length], liquid: colors[i % colors.length], cap: i % 2 ? '#c9a96e' : '#1a1a1a' },
      { quality: 'low', name: names[i % (names.length || 1)] || 'ZAQA' }
    );
    const g = new THREE.Group();
    g.add(b);
    b.position.y = -b.userData.height / 2;
    const side = i % 2 ? 1 : -1;
    g.position.set(side * (2.5 + (i % 3) * 2.2) + (Math.random() - 0.5), (Math.random() - 0.5) * 2.2, -2 - (i % 3) * 2.6);
    g.rotation.set((Math.random() - 0.5) * 0.6, Math.random() * Math.PI, (Math.random() - 0.5) * 0.5);
    g.userData = { seed: Math.random() * 10, spin: 0.15 + Math.random() * 0.25, base: g.position.clone() };
    scene.add(g);
    bottles.push(g);
  }
  const dust = makeDust({ count: 500, spread: [22, 8, 12], y: 0 });
  scene.add(dust);
  const shaft = makeLightShaft({ height: 10, radiusBottom: 3.2, intensity: 0.22 });
  shaft.position.set(0, 6, -3);
  shaft.rotation.z = 0.25;
  scene.add(shaft);

  stage.onFrame((t, dt) => {
    updatePointer(dt);
    camera.position.set(pointer.x * 0.8, pointer.y * 0.4, 8);
    camera.lookAt(0, 0, -2);
    for (const g of bottles) {
      const { seed, spin, base } = g.userData;
      g.position.y = base.y + Math.sin(t * 0.6 + seed) * 0.35;
      g.rotation.y += dt * spin;
      g.rotation.z = Math.sin(t * 0.4 + seed) * 0.15;
    }
    dust.userData.update(t);
    shaft.userData.update(t);
  });
  stage.start();
  return stage;
}

/* ------------------------------------------------------------------ */
/* Product viewer: drag to rotate, on a lit pedestal                  */
/* ------------------------------------------------------------------ */
export async function productViewer(canvas, product) {
  await loadLogoFonts();
  const stage = createStage(canvas, { bloom: true, bloomStrength: 0.45, bloomThreshold: 0.85, fov: 30, background: 0x0b0a09 });
  const { scene, camera, renderer } = stage;
  addStudioLights(scene);
  const pedestal = makePedestal({ radius: 1.5 });
  scene.add(pedestal);
  const bottle = makeBottle(product.bottle, { quality: 'high', name: product.name, sub: `EAU DE PARFUM · ${product.sizeMl} ML` });
  bottle.position.y = 0.02;
  scene.add(bottle);
  const h = bottle.userData.height;
  const shaft = makeLightShaft({ height: 9, radiusBottom: 2, intensity: 0.28 });
  shaft.position.set(0, 9, 0);
  scene.add(shaft);
  const dust = makeDust({ count: 350, spread: [8, 6, 6], y: 2, size: 0.04 });
  scene.add(dust);

  camera.position.set(0, h * 0.75, 4.2 + h * 1.6);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0, h * 0.48, 0);
  controls.enableDamping = true;
  controls.enablePan = false;
  controls.enableZoom = false;
  controls.autoRotate = !reducedMotion;
  controls.autoRotateSpeed = 1.4;
  controls.minPolarAngle = Math.PI * 0.25;
  controls.maxPolarAngle = Math.PI * 0.55;
  controls.addEventListener('start', () => (controls.autoRotate = false));
  controls.addEventListener('end', () => setTimeout(() => (controls.autoRotate = !reducedMotion), 3000));

  // Gentle intro: the camera settles in from a lower, closer angle.
  const settle = camera.position.clone().multiplyScalar(1.08);
  let settled = false;
  camera.position.set(0.8, h * 0.3, 2.6 + h);
  controls.addEventListener('start', () => (settled = true));
  stage.onFrame((t, dt) => {
    if (!settled) {
      camera.position.lerp(settle, Math.min(dt * 2.2, 1));
      if (camera.position.distanceTo(settle) < 0.02) settled = true;
    }
    controls.update();
    shaft.userData.update(t);
    dust.userData.update(t);
  });
  stage.start();
  return stage;
}

/* ------------------------------------------------------------------ */
/* Login: a still-life of three bottles under a slow orbiting camera  */
/* ------------------------------------------------------------------ */
export async function loginScene(canvas) {
  await loadLogoFonts();
  const stage = createStage(canvas, { bloom: true, bloomStrength: 0.65, fov: 32, fog: { density: 0.05 } });
  const { scene, camera } = stage;
  addStudioLights(scene);
  const pedestal = makePedestal({ radius: 2.4, height: 0.3 });
  scene.add(pedestal);
  const hero = makeBottle({ shape: 'classic', liquid: '#c9a24d', cap: '#c9a96e' }, { quality: 'high', name: 'ZAQA Signature' });
  scene.add(hero);
  const left = makeBottle({ shape: 'oud', liquid: '#3a1f10', cap: '#c9a96e' }, { quality: 'low', name: 'Oud Al Layl' });
  left.position.set(-1.45, 0, -0.9);
  left.rotation.y = 0.5;
  scene.add(left);
  const right = makeBottle({ shape: 'round', liquid: '#e8a4b4', cap: '#d4af7a' }, { quality: 'low', name: 'Rose Éternelle' });
  right.position.set(1.4, 0, -0.7);
  right.scale.setScalar(0.85);
  right.rotation.y = -0.5;
  scene.add(right);
  const shaft = makeLightShaft({ height: 10, radiusBottom: 3, intensity: 0.3 });
  shaft.position.set(0, 9.5, 0);
  scene.add(shaft);
  const dust = makeDust({ count: 800, spread: [14, 9, 10], y: 2.5 });
  scene.add(dust);
  stage.onFrame((t, dt) => {
    updatePointer(dt);
    const a = Math.sin(t * 0.12) * 0.5 + pointer.x * 0.2;
    const r = 10 * fit(camera, 1.1);
    camera.position.set(Math.sin(a) * r, 2.6 + pointer.y * 0.3, Math.cos(a) * r);
    camera.lookAt(0, 1.25, 0);
    hero.rotation.y = t * 0.25;
    shaft.userData.update(t);
    dust.userData.update(t);
  });
  stage.start();
  return stage;
}

/* ------------------------------------------------------------------ */
/* Admin: a spinning gold ZQ medallion                                */
/* ------------------------------------------------------------------ */
export async function emblemScene(canvas) {
  await loadLogoFonts();
  const stage = createStage(canvas, { fov: 30, background: null, maxDpr: 2 });
  const { scene, camera } = stage;
  addStudioLights(scene, { spot: false });
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(256, 220, 20, 256, 256, 260);
  g.addColorStop(0, '#2a2118');
  g.addColorStop(1, '#0d0a07');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 512, 512);
  drawLogo(ctx, { ox: 56, oy: 50, size: 400, ink: '#e8d3a4', script: '#fff1d0', cut: '#1c1611' });
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const face = new THREE.MeshPhysicalMaterial({ map: tex, metalness: 0.6, roughness: 0.3, clearcoat: 1 });
  const edge = new THREE.MeshPhysicalMaterial({ color: 0xc9a96e, metalness: 1, roughness: 0.2 });
  const coin = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 0.14, 96), [edge, face, face]);
  coin.rotation.x = Math.PI / 2;
  const holder = new THREE.Group();
  holder.add(coin);
  scene.add(holder);
  camera.position.set(0, 0, 4.4);
  stage.onFrame((t) => {
    holder.rotation.y = Math.sin(t * 0.8) * 0.9;
    holder.rotation.x = Math.sin(t * 0.5) * 0.12;
  });
  stage.start();
  return stage;
}
