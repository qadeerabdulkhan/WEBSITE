// Procedural luxury perfume bottles, modelled on real flacons: a glass shell with real wall
// thickness and a heavy glass base, coloured juice that refracts light, a dip tube, a crimped
// metal collar, a weighted cap, and gold or ink printed directly on the glass.
// spec: { shape, liquid, cap, glass }  shape: classic | round | tall | flask | oud | mist
// glass: clear | frosted | black | smoked
import { THREE } from './core.js';
import { RoundedBoxGeometry } from '../../vendor/three/addons/RoundedBoxGeometry.js';
import { drawLogo } from '../logo.js';

const lightness = (hex) => new THREE.Color(hex).getHSL({ h: 0, s: 0, l: 0 }).l;

/* ---------------- Materials ---------------- */

// Glass shell. Mostly see-through, but reflections and grazing angles turn opaque the way real
// glass does, which is what makes the edges and highlights read as glass.
function shellMaterial(style = 'clear', { side = THREE.FrontSide, edge = 0.42 } = {}) {
  if (style === 'black') {
    return new THREE.MeshPhysicalMaterial({
      color: 0x060606, metalness: 0.1, roughness: 0.08, clearcoat: 1, clearcoatRoughness: 0.03, envMapIntensity: 1.8, side,
    });
  }
  const frosted = style === 'frosted';
  const m = new THREE.MeshPhysicalMaterial({
    color: frosted ? 0xf4f1ec : style === 'smoked' ? 0x15110c : 0x000000,
    metalness: 0,
    roughness: frosted ? 0.42 : 0.025,
    ior: 1.5,
    specularIntensity: 1,
    clearcoat: frosted ? 0.2 : 1,
    clearcoatRoughness: 0.02,
    envMapIntensity: frosted ? 1.1 : 2.4,
    transparent: true,
    opacity: frosted ? 0.42 : style === 'smoked' ? 0.38 : 0.035,
    depthWrite: false,
    side,
  });
  m.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <opaque_fragment>',
      `float zqFres = pow(1.0 - clamp(abs(dot(normalize(normal), normalize(vViewPosition))), 0.0, 1.0), 2.4);
       float zqLuma = max(max(outgoingLight.r, outgoingLight.g), outgoingLight.b);
       diffuseColor.a = clamp(diffuseColor.a + zqFres * ${edge.toFixed(2)} + zqLuma * ${frosted ? '0.15' : '0.75'}, 0.0, 1.0);
       #include <opaque_fragment>`
    );
  };
  m.customProgramCacheKey = () => `zq-shell-${style}-${edge}`;
  return m;
}

// Coloured juice. In high quality it is transmissive: light passing through picks up the colour
// over distance, so thin areas look pale and thick areas look rich, like real perfume.
function liquidMaterial(hex, quality) {
  const c = new THREE.Color(hex);
  if (quality === 'high') {
    const l = lightness(hex);
    return new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      metalness: 0,
      roughness: 0,
      transmission: 1,
      ior: 1.36,
      thickness: 0.9,
      attenuationColor: c,
      attenuationDistance: 0.25 + l * 0.9,
      specularIntensity: 0.7,
      envMapIntensity: 1,
    });
  }
  return new THREE.MeshPhysicalMaterial({
    color: c, roughness: 0.08, clearcoat: 0.8, emissive: c, emissiveIntensity: 0.12, transparent: true, opacity: 0.86, envMapIntensity: 1.2,
  });
}

// The heavy, slightly green-tinted glass base found on luxury bottles.
function baseGlassMaterial(quality, style) {
  if (style === 'black') return shellMaterial('black');
  if (quality === 'high' && style !== 'frosted') {
    return new THREE.MeshPhysicalMaterial({
      color: 0xffffff, transmission: 1, roughness: 0.01, ior: 1.5, thickness: 0.5,
      attenuationColor: new THREE.Color(0xdcefe4), attenuationDistance: 2.5, specularIntensity: 1, envMapIntensity: 2,
    });
  }
  return shellMaterial(style, { edge: 0.9 });
}

let brushedTex;
function brushedRoughness() {
  if (brushedTex) return brushedTex;
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#7a7a7a';
  g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 1400; i++) {
    const v = 90 + Math.random() * 90;
    g.fillStyle = `rgba(${v},${v},${v},0.35)`;
    g.fillRect(0, Math.random() * 256, 256, Math.random() * 1.4);
  }
  brushedTex = new THREE.CanvasTexture(c);
  brushedTex.wrapS = brushedTex.wrapT = THREE.RepeatWrapping;
  return brushedTex;
}

function metalMaterial(hex) {
  if (lightness(hex) < 0.22) {
    // Black lacquered zamac.
    return new THREE.MeshPhysicalMaterial({ color: hex, metalness: 0.35, roughness: 0.22, clearcoat: 1, clearcoatRoughness: 0.05, envMapIntensity: 1.5 });
  }
  return new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(hex).offsetHSL(0, 0.05, 0.06), metalness: 1, roughness: 0.2, roughnessMap: brushedRoughness(), anisotropy: 0.6, envMapIntensity: 3.2,
  });
}

function crystalMaterial(quality) {
  if (quality === 'high') {
    return new THREE.MeshPhysicalMaterial({
      color: 0xffffff, transmission: 1, roughness: 0.02, ior: 1.5, thickness: 0.5, specularIntensity: 1, envMapIntensity: 1.6,
    });
  }
  const m = shellMaterial('clear', { edge: 0.95 });
  m.flatShading = true;
  return m;
}

/* ---------------- Printed label ---------------- */

const fit = (ctx, text, weight, size, family, maxW) => {
  let s = size;
  ctx.font = `${weight} ${s}px ${family}`;
  while (ctx.measureText(text).width > maxW && s > 12) {
    s -= 2;
    ctx.font = `${weight} ${s}px ${family}`;
  }
};

const spaced = (t) => t.split('').join(String.fromCharCode(8202));

// Ink printed straight onto the glass (no sticker): monogram, name, concentration and size.
export function labelTexture({ name = 'ZAQA', sub = 'EAU DE PARFUM', size = '100 ml', ink = '#d9b878' } = {}) {
  const w = 1024;
  const h = 768;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  const isGold = ink !== '#1b1915';
  const paint = isGold
    ? (() => {
        const grd = ctx.createLinearGradient(0, 0, w, h);
        grd.addColorStop(0, '#f3e1b0');
        grd.addColorStop(0.45, '#c9a35e');
        grd.addColorStop(0.7, '#f6e7bf');
        grd.addColorStop(1, '#b38a45');
        return grd;
      })()
    : ink;
  drawLogo(ctx, { ox: w / 2 - 150, oy: 30, size: 300, ink: isGold ? '#e3c88a' : ink, script: isGold ? '#fbf1d6' : ink });
  ctx.fillStyle = paint;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.font = '600 40px "Cormorant Garamond", serif';
  ctx.fillText(spaced('Z A Q A'), w / 2, 390);
  const label = name.toUpperCase();
  fit(ctx, label, 600, 92, '"Cormorant Garamond", serif', w - 120);
  ctx.fillText(label, w / 2, 500);
  ctx.fillRect(w / 2 - 70, 535, 140, 3);
  fit(ctx, spaced(sub.toUpperCase()), 600, 30, '"Manrope", sans-serif', w - 160);
  ctx.fillText(spaced(sub.toUpperCase()), w / 2, 600);
  ctx.font = '500 28px "Manrope", sans-serif';
  ctx.globalAlpha = 0.85;
  ctx.fillText(size, w / 2, 660);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

function labelMaterial(tex, gold) {
  return new THREE.MeshPhysicalMaterial({
    map: tex,
    transparent: true,
    alphaTest: 0.04,
    depthWrite: false,
    metalness: gold ? 0.85 : 0.05,
    roughness: gold ? 0.28 : 0.45,
    envMapIntensity: gold ? 1.6 : 0.8,
    polygonOffset: true,
    polygonOffsetFactor: -2,
  });
}

/* ---------------- Geometry helpers ---------------- */

const SEG = 96;

function lathe(points, segments = SEG) {
  return new THREE.LatheGeometry(points.map(([r, y]) => new THREE.Vector2(Math.max(r, 0.0001), y)), segments);
}

// Radius of a profile at height y (linear interpolation between profile points).
function radiusAt(profile, y) {
  for (let i = 1; i < profile.length; i++) {
    const [r0, y0] = profile[i - 1];
    const [r1, y1] = profile[i];
    if (y >= y0 && y <= y1) return r0 + (r1 - r0) * ((y - y0) / (y1 - y0 || 1));
  }
  return profile[profile.length - 1][0];
}

// A closed solid of revolution following the profile between y0 and y1, shrunk by inset.
function profileSolid(profile, y0, y1, inset, steps = 28) {
  const pts = [[0, y0]];
  for (let i = 0; i <= steps; i++) {
    const y = y0 + ((y1 - y0) * i) / steps;
    pts.push([Math.max(radiusAt(profile, y) - inset, 0.001), y]);
  }
  pts.push([0, y1]);
  return lathe(pts);
}

// Shells with real rounded profiles. Each lists [radius, y] from the base up to the shoulder.
const PROFILES = {
  round: [[0, 0], [0.5, 0], [0.74, 0.08], [0.93, 0.3], [1.0, 0.62], [0.98, 0.92], [0.88, 1.2], [0.66, 1.46], [0.36, 1.62], [0.17, 1.68], [0.0, 1.68]],
  tall: [[0, 0], [0.5, 0], [0.555, 0.03], [0.57, 0.1], [0.57, 1.98], [0.55, 2.08], [0.42, 2.17], [0.19, 2.22], [0, 2.22]],
  flask: [[0, 0], [0.52, 0], [0.8, 0.12], [0.96, 0.42], [0.98, 0.72], [0.86, 1.08], [0.62, 1.42], [0.34, 1.68], [0.18, 1.78], [0, 1.78]],
  mist: [[0, 0], [0.38, 0], [0.43, 0.03], [0.44, 0.1], [0.44, 2.3], [0.41, 2.4], [0.2, 2.45], [0, 2.45]],
};

function contactShadow(width, depth) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(64, 64, 4, 64, 64, 64);
  grd.addColorStop(0, 'rgba(0,0,0,0.75)');
  grd.addColorStop(0.45, 'rgba(0,0,0,0.35)');
  grd.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(c);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(width, depth), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }));
  m.rotation.x = -Math.PI / 2;
  m.position.y = 0.003;
  m.renderOrder = -1;
  return m;
}

/* ---------------- Bottle ---------------- */

/**
 * spec: { shape, liquid, cap, glass }   opts: { quality: 'high'|'low', name, sub, size, label, shadow }
 * Returns a Group standing on y = 0. userData.height is the full height.
 */
export function makeBottle(spec = {}, opts = {}) {
  const shape = (PROFILES[spec.shape] || ['classic', 'oud'].includes(spec.shape)) ? spec.shape : 'classic';
  const quality = opts.quality || 'high';
  const hi = quality === 'high';
  const style = ['clear', 'frosted', 'black', 'smoked'].includes(spec.glass) ? spec.glass : shape === 'mist' ? 'frosted' : 'clear';
  const liquidHex = spec.liquid || '#e9d29a';
  const capHex = spec.cap || '#c9a96e';
  const group = new THREE.Group();
  const add = (geo, mat, y = 0, extra) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.y = y;
    extra?.(m);
    group.add(m);
    return m;
  };
  const front = shellMaterial(style);
  const back = style === 'black' ? null : shellMaterial(style, { side: THREE.BackSide, edge: 0.25 });
  const juice = liquidMaterial(liquidHex, quality);
  const baseMat = baseGlassMaterial(quality, style);
  const metal = metalMaterial(capHex);
  const collarMetal = metalMaterial(lightness(capHex) < 0.22 ? '#b9b4ac' : capHex);
  const showJuice = style !== 'black';

  // Ink: gold on dark juice or black glass, near-black on pale juice.
  const gold = style === 'black' || style === 'smoked' || lightness(liquidHex) < 0.36;
  const tex = opts.label === false ? null : labelTexture({ name: opts.name || 'ZAQA', sub: opts.sub || 'Eau de Parfum', size: opts.size || '100 ml', ink: gold ? '#d9b878' : '#1b1915' });
  const labelMat = tex && labelMaterial(tex, gold);

  let top;
  let footW;
  let footD;
  const WALL = 0.065;

  if (shape === 'classic') {
    const W = 1.5, H = 1.9, D = 0.82, BASE = 0.34;
    add(new RoundedBoxGeometry(W, H, D, 6, 0.08), front, H / 2, (m) => (m.renderOrder = 2));
    if (back) add(new RoundedBoxGeometry(W - WALL * 2, H - BASE - WALL, D - WALL * 2, 4, 0.05), back, BASE + (H - BASE - WALL) / 2, (m) => (m.renderOrder = 1));
    add(new RoundedBoxGeometry(W - 0.02, BASE, D - 0.02, 4, 0.07), baseMat, BASE / 2);
    const fill = (H - BASE - WALL) * 0.82;
    if (showJuice) add(new RoundedBoxGeometry(W - WALL * 2 - 0.01, fill, D - WALL * 2 - 0.01, 4, 0.045), juice, BASE + fill / 2);
    if (labelMat) add(new THREE.PlaneGeometry(1.08, 0.81), labelMat, BASE + (H - BASE) * 0.47, (m) => ((m.position.z = D / 2 + 0.002), (m.renderOrder = 3)));
    top = H;
    footW = W;
    footD = D;
  } else if (shape === 'oud') {
    // Cut-crystal octagonal attar bottle.
    const H = 1.7, BASE = 0.26;
    const rot = (m) => (m.rotation.y = Math.PI / 8);
    const facet = (rt, rb, h) => {
      const g = new THREE.CylinderGeometry(rt, rb, h, 8, 1);
      return g;
    };
    const fr = shellMaterial(style);
    fr.flatShading = true;
    add(facet(0.72, 0.86, H), fr, H / 2, (m) => (rot(m), (m.renderOrder = 2)));
    if (back) {
      const bk = shellMaterial(style, { side: THREE.BackSide, edge: 0.25 });
      bk.flatShading = true;
      add(facet(0.64, 0.76, H - BASE - WALL), bk, BASE + (H - BASE - WALL) / 2, (m) => (rot(m), (m.renderOrder = 1)));
    }
    add(facet(0.83, 0.855, BASE), baseMat, BASE / 2, rot);
    const fill = (H - BASE - WALL) * 0.8;
    if (showJuice) add(facet(0.63 + 0.0, 0.75, fill), juice, BASE + fill / 2, rot);
    const r = 0.79 * Math.cos(Math.PI / 8);
    if (labelMat) add(new THREE.PlaneGeometry(0.58, 0.435), labelMat, H * 0.52, (m) => ((m.position.z = r + 0.006), (m.renderOrder = 3)));
    top = H;
    footW = footD = 1.7;
  } else {
    const prof = PROFILES[shape];
    const H = prof[prof.length - 1][1];
    const BASE = shape === 'mist' ? 0.12 : 0.24;
    const flat = shape === 'round' ? 0.6 : 1;
    const flatten = (m) => (m.scale.z = flat);
    add(lathe(prof), front, 0, (m) => (flatten(m), (m.renderOrder = 2)));
    if (back) add(profileSolid(prof, BASE, H - WALL, WALL), back, 0, (m) => (flatten(m), (m.renderOrder = 1)));
    add(profileSolid(prof, 0.004, BASE, 0.008), baseMat, 0, flatten);
    const fillY = BASE + (H - WALL - BASE) * (shape === 'mist' ? 0.85 : 0.78);
    if (showJuice) add(profileSolid(prof, BASE, fillY, WALL + 0.006), juice, 0, flatten);
    if (labelMat) {
      const ly = shape === 'flask' ? 0.66 : shape === 'round' ? 0.78 : H * 0.47;
      const rAt = radiusAt(prof, ly);
      if (shape === 'round') {
        add(new THREE.PlaneGeometry(0.96, 0.72), labelMat, ly, (m) => ((m.position.z = rAt * flat + 0.004), (m.renderOrder = 3)));
      } else {
        const lh = shape === 'mist' ? 0.6 : shape === 'flask' ? 0.62 : 0.78;
        const arc = Math.min((lh * 1.333) / rAt, Math.PI * 0.9);
        add(new THREE.CylinderGeometry(rAt + 0.004, rAt + 0.004, lh, 64, 1, true, -arc / 2, arc), labelMat, ly, (m) => (m.renderOrder = 3));
      }
    }
    top = H;
    footW = radiusAt(prof, 0.3) * 2;
    footD = footW * flat;
  }

  // Dip tube running from the pump down to the base (seen refracted through the juice).
  if (hi && showJuice && style !== 'frosted') {
    const tubeH = top - 0.32;
    add(new THREE.CylinderGeometry(0.011, 0.011, tubeH, 12), new THREE.MeshStandardMaterial({ color: 0xcfcfc8, roughness: 0.25 }), 0.3 + tubeH / 2, (m) => (m.position.x = 0.05));
  }

  // Glass neck and crimped metal collar (ferrule) with machined ridges.
  add(new THREE.CylinderGeometry(0.15, 0.17, 0.12, 48), front, top + 0.05, (m) => (m.renderOrder = 2));
  const ridge = [];
  for (let i = 0; i <= 8; i++) ridge.push([0.235 + (i % 2 ? 0.008 : 0), 0.012 * i]);
  add(lathe([[0, 0], [0.21, 0], ...ridge, [0.2, 0.105], [0, 0.105]], 64), collarMetal, top + 0.1);
  const capBase = top + 0.2;

  // Caps.
  if (shape === 'classic') {
    add(new RoundedBoxGeometry(0.82, 0.64, 0.66, 5, 0.045), metal, capBase + 0.32);
    add(new RoundedBoxGeometry(0.86, 0.035, 0.7, 2, 0.015), collarMetal, capBase + 0.02);
    top = capBase + 0.64;
  } else if (shape === 'round') {
    // Faceted crystal stopper.
    // Faceted crystal stopper: a low-poly sphere with merged normals reads as cut glass without artifacts.
    add(new THREE.SphereGeometry(0.4, 10, 6), crystalMaterial(quality), capBase + 0.38, (m) => (m.scale.set(1, 1.12, 0.78), (m.rotation.y = 0.3)));
    add(new THREE.CylinderGeometry(0.13, 0.13, 0.12, 32), crystalMaterial(quality), capBase + 0.04);
    top = capBase + 0.84;
  } else if (shape === 'tall') {
    add(lathe([[0, 0], [0.285, 0], [0.3, 0.02], [0.3, 0.74], [0.285, 0.76], [0, 0.76]], 96), metal, capBase);
    add(new THREE.TorusGeometry(0.301, 0.012, 12, 96), collarMetal, capBase + 0.12, (m) => (m.rotation.x = Math.PI / 2));
    top = capBase + 0.76;
  } else if (shape === 'flask') {
    // Tall teardrop glass stopper.
    add(lathe([[0, 0], [0.1, 0], [0.2, 0.12], [0.28, 0.36], [0.26, 0.62], [0.16, 0.86], [0.05, 1.0], [0, 1.02]], 64), crystalMaterial(quality), capBase);
    top = capBase + 1.02;
  } else if (shape === 'oud') {
    // Ornate dome with an engraved band and a spire.
    add(new THREE.CylinderGeometry(0.4, 0.4, 0.12, 64), metal, capBase + 0.06);
    add(new THREE.TorusGeometry(0.4, 0.025, 12, 64), collarMetal, capBase + 0.12, (m) => (m.rotation.x = Math.PI / 2));
    add(new THREE.SphereGeometry(0.4, 64, 32, 0, Math.PI * 2, 0, Math.PI / 2), metal, capBase + 0.12);
    add(lathe([[0.12, 0], [0.07, 0.15], [0.03, 0.5], [0.0, 0.62]], 32), collarMetal, capBase + 0.5);
    add(new THREE.SphereGeometry(0.07, 24, 16), collarMetal, capBase + 0.58);
    top = capBase + 1.12;
  } else {
    // Body mist: plastic actuator with nozzle under a clear over-cap.
    const plastic = new THREE.MeshPhysicalMaterial({ color: capHex, roughness: 0.45, metalness: 0.0, clearcoat: 0.3 });
    add(new THREE.CylinderGeometry(0.19, 0.21, 0.3, 48), plastic, capBase + 0.15);
    add(new THREE.CylinderGeometry(0.05, 0.05, 0.08, 16), plastic, capBase + 0.22, (m) => ((m.rotation.z = Math.PI / 2), (m.position.x = 0.21)));
    add(lathe([[0.44, 0], [0.445, 0.6], [0.42, 0.66], [0, 0.67]], 64), shellMaterial('clear', { edge: 0.6 }), capBase - 0.02, (m) => (m.renderOrder = 2));
    top = capBase + 0.65;
  }

  if (opts.shadow !== false) group.add(contactShadow(footW * 1.9, footD * 2.4 + 0.6));

  group.userData = { height: top, label: null, dispose: () => disposeGroup(group) };
  return group;
}

export function disposeGroup(group) {
  group.traverse((o) => {
    if (o.isMesh) {
      o.geometry.dispose();
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      mats.forEach((m) => {
        if (m.map) m.map.dispose();
        m.dispose();
      });
    }
  });
}
