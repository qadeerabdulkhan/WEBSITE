// Procedural luxury perfume bottles. Each product picks a shape, liquid and cap colour,
// so every fragrance gets its own 3D bottle without needing product photography.
import { THREE } from './core.js';
import { RoundedBoxGeometry } from '../../vendor/three/addons/RoundedBoxGeometry.js';
import { drawLogo } from '../logo.js';

const isDark = (hex) => new THREE.Color(hex).getHSL({ h: 0, s: 0, l: 0 }).l < 0.25;

function capMaterial(hex) {
  if (isDark(hex)) {
    return new THREE.MeshPhysicalMaterial({ color: hex, metalness: 0.4, roughness: 0.18, clearcoat: 1, clearcoatRoughness: 0.08, envMapIntensity: 1.4 });
  }
  return new THREE.MeshPhysicalMaterial({ color: hex, metalness: 1, roughness: 0.22, envMapIntensity: 1.6 });
}

function glassMaterial(quality) {
  if (quality === 'high') {
    return new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      metalness: 0,
      roughness: 0.03,
      transmission: 1,
      thickness: 0.7,
      ior: 1.5,
      clearcoat: 1,
      clearcoatRoughness: 0.03,
      specularIntensity: 1,
      envMapIntensity: 1.8,
    });
  }
  return new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    metalness: 0.1,
    roughness: 0.04,
    transparent: true,
    opacity: 0.14,
    clearcoat: 1,
    envMapIntensity: 1.3,
    depthWrite: false,
  });
}

function liquidMaterial(hex) {
  const c = new THREE.Color(hex);
  return new THREE.MeshPhysicalMaterial({
    color: c,
    roughness: 0.12,
    metalness: 0,
    clearcoat: 0.8,
    sheen: 0.6,
    sheenColor: c.clone().offsetHSL(0, 0, 0.25),
    emissive: c,
    emissiveIntensity: 0.22,
    envMapIntensity: 1.2,
    transparent: true,
    opacity: 0.94,
  });
}

// Closed lathe profile from [radius, y] pairs.
function lathe(points, scale = 1, segments = 72) {
  const pts = points.map(([r, y]) => new THREE.Vector2(Math.max(r * scale, 0.0001), y));
  return new THREE.LatheGeometry(pts, segments);
}

// Clip a lathe profile to the fill height for the liquid inside.
function liquidProfile(points, fillY, inset = 0.86, floor = 0.06) {
  const out = [[0, floor]];
  for (let i = 1; i < points.length; i++) {
    const [r0, y0] = points[i - 1];
    const [r1, y1] = points[i];
    if (y1 <= floor) continue;
    if (y0 < fillY && y1 >= fillY) {
      const t = (fillY - y0) / (y1 - y0 || 1);
      out.push([(r0 + (r1 - r0) * t) * inset, fillY]);
      break;
    }
    if (y1 < fillY) out.push([r1 * inset, Math.max(y1, floor)]);
  }
  out.push([0, fillY]);
  return out;
}

export function labelTexture({ name = 'ZAQA', sub = 'EAU DE PARFUM', w = 512, h = 384, ink = '#e8d3a4' } = {}) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  ctx.fillStyle = 'rgba(12,10,8,0.82)';
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = ink;
  ctx.lineWidth = 3;
  ctx.strokeRect(14, 14, w - 28, h - 28);
  ctx.lineWidth = 1;
  ctx.strokeRect(24, 24, w - 48, h - 48);
  drawLogo(ctx, { ox: w / 2 - 95, oy: 22, size: 190, ink, script: '#fff3dc', cut: 'rgba(12,10,8,1)' });
  ctx.fillStyle = ink;
  ctx.textAlign = 'center';
  ctx.font = '600 44px "Cormorant Garamond", serif';
  const label = name.toUpperCase();
  let size = 44;
  while (ctx.measureText(label).width > w - 80 && size > 20) {
    size -= 2;
    ctx.font = `600 ${size}px "Cormorant Garamond", serif`;
  }
  ctx.fillText(label, w / 2, h - 82);
  ctx.font = '500 18px "Manrope", sans-serif';
  ctx.globalAlpha = 0.8;
  ctx.fillText(sub.split('').join(String.fromCharCode(8202)), w / 2, h - 48);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

function labelMaterial(tex) {
  return new THREE.MeshPhysicalMaterial({ map: tex, transparent: true, roughness: 0.35, metalness: 0.55, clearcoat: 0.5, envMapIntensity: 1.2 });
}

/**
 * spec: { shape, liquid, cap }   opts: { quality: 'high'|'low', name, sub }
 * Returns a Group standing on y = 0. userData.height is the full height.
 */
export function makeBottle(spec = {}, opts = {}) {
  const shape = spec.shape || 'classic';
  const quality = opts.quality || 'high';
  const glass = glassMaterial(quality);
  const liquid = liquidMaterial(spec.liquid || '#c9a24d');
  const metal = capMaterial(spec.cap || '#c9a96e');
  const gold = capMaterial('#c9a96e');
  const group = new THREE.Group();
  const add = (geo, mat, y = 0, extra) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.y = y;
    extra?.(m);
    group.add(m);
    return m;
  };
  const tex = opts.label === false ? null : labelTexture({ name: opts.name || 'ZAQA', sub: opts.sub || 'EAU DE PARFUM' });
  let top = 0;
  let label = null;

  if (shape === 'classic') {
    const W = 1.5, H = 1.85, D = 0.8;
    add(new RoundedBoxGeometry(W, H, D, 6, 0.14), glass, H / 2);
    add(new RoundedBoxGeometry(W - 0.2, H * 0.74, D - 0.2, 4, 0.08), liquid, 0.1 + (H * 0.74) / 2);
    if (tex) label = add(new THREE.PlaneGeometry(1.0, 0.75), labelMaterial(tex), H * 0.45, (m) => (m.position.z = D / 2 + 0.004));
    top = H;
  } else if (shape === 'oud') {
    const H = 1.75;
    add(new THREE.CylinderGeometry(0.72, 0.86, H, 8), glass, H / 2, (m) => (m.rotation.y = Math.PI / 8));
    add(new THREE.CylinderGeometry(0.6, 0.72, H * 0.72, 8), liquid, 0.08 + (H * 0.72) / 2, (m) => (m.rotation.y = Math.PI / 8));
    const r = 0.79 * Math.cos(Math.PI / 8);
    if (tex) label = add(new THREE.PlaneGeometry(0.58, 0.44), labelMaterial(tex), H * 0.5, (m) => (m.position.z = r + 0.006));
    top = H;
  } else {
    const profiles = {
      round: [[0, 0], [0.55, 0.02], [0.85, 0.18], [0.98, 0.5], [1.0, 0.85], [0.95, 1.15], [0.78, 1.45], [0.5, 1.66], [0.22, 1.74], [0, 1.74]],
      tall: [[0, 0], [0.5, 0], [0.58, 0.08], [0.58, 2.0], [0.47, 2.14], [0.22, 2.2], [0, 2.2]],
      flask: [[0, 0], [0.6, 0], [0.88, 0.22], [0.98, 0.58], [0.9, 1.0], [0.66, 1.38], [0.34, 1.66], [0.2, 1.76], [0, 1.76]],
      mist: [[0, 0], [0.4, 0], [0.44, 0.05], [0.44, 2.3], [0.37, 2.4], [0, 2.4]],
    };
    const prof = profiles[shape] || profiles.tall;
    const H = prof[prof.length - 1][1];
    const flat = shape === 'round' ? 0.58 : 1;
    const body = add(lathe(prof), glass, 0, (m) => (m.scale.z = flat));
    const liq = add(lathe(liquidProfile(prof, H * 0.74)), liquid, 0, (m) => (m.scale.z = flat));
    void body;
    void liq;
    if (tex) {
      if (shape === 'round') {
        label = add(new THREE.PlaneGeometry(0.95, 0.71), labelMaterial(tex), H * 0.5, (m) => (m.position.z = 1.0 * flat + 0.004));
      } else {
        const rAt = shape === 'flask' ? 0.97 : shape === 'mist' ? 0.44 : 0.58;
        const lh = shape === 'mist' ? 0.62 : shape === 'flask' ? 0.6 : 0.78;
        const arc = Math.min((lh * 1.33) / rAt, Math.PI * 0.9);
        const geo = new THREE.CylinderGeometry(rAt + 0.006, rAt + 0.006, lh, 48, 1, true, -arc / 2, arc);
        label = add(geo, labelMaterial(tex), shape === 'flask' ? 0.66 : H * 0.48);
      }
    }
    top = H;
  }

  // Neck and collar.
  add(new THREE.CylinderGeometry(0.15, 0.18, 0.16, 32), glass, top + 0.06);
  add(new THREE.CylinderGeometry(0.25, 0.25, 0.09, 48), gold, top + 0.17);
  const capBase = top + 0.21;

  // Cap.
  if (shape === 'classic') {
    add(new RoundedBoxGeometry(0.72, 0.62, 0.72, 4, 0.06), metal, capBase + 0.31);
    top = capBase + 0.62;
  } else if (shape === 'round') {
    add(new THREE.IcosahedronGeometry(0.42, 0), metal, capBase + 0.36, (m) => (m.material = m.material.clone(), m.material.flatShading = true, m.scale.y = 1.1));
    top = capBase + 0.82;
  } else if (shape === 'tall') {
    add(new THREE.CylinderGeometry(0.3, 0.3, 0.72, 64), metal, capBase + 0.36);
    add(new THREE.TorusGeometry(0.3, 0.02, 12, 64), gold, capBase + 0.12, (m) => (m.rotation.x = Math.PI / 2));
    top = capBase + 0.72;
  } else if (shape === 'flask') {
    add(new THREE.SphereGeometry(0.3, 48, 32), metal, capBase + 0.5, (m) => m.scale.set(1, 1.75, 1));
    top = capBase + 1.02;
  } else if (shape === 'oud') {
    add(new THREE.SphereGeometry(0.42, 48, 24, 0, Math.PI * 2, 0, Math.PI / 2), metal, capBase);
    add(new THREE.ConeGeometry(0.12, 0.55, 24), gold, capBase + 0.66);
    add(new THREE.SphereGeometry(0.07, 24, 16), gold, capBase + 0.98);
    top = capBase + 1.05;
  } else if (shape === 'mist') {
    add(new THREE.CylinderGeometry(0.2, 0.22, 0.32, 48), metal, capBase + 0.16);
    add(new THREE.CylinderGeometry(0.06, 0.06, 0.1, 16), metal, capBase + 0.36, (m) => (m.rotation.z = Math.PI / 2, m.position.x = 0.16));
    add(new THREE.CylinderGeometry(0.44, 0.44, 0.62, 64, 1, false), glassMaterial('low'), capBase + 0.31);
    top = capBase + 0.62;
  }

  group.userData = { height: top, label, dispose: () => disposeGroup(group) };
  return group;
}

export function disposeGroup(group) {
  group.traverse((o) => {
    if (o.isMesh) {
      o.geometry.dispose();
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      mats.forEach((m) => {
        m.map?.dispose();
        m.dispose();
      });
    }
  });
}
