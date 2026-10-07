// Cinematic set pieces: gold dust, volumetric light shafts, a lacquered pedestal and lights.
import { THREE } from './core.js';

export function makeDust({ count = 700, spread = [14, 9, 10], color = 0xe8d3a4, size = 0.05, y = 0 } = {}) {
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(count * 3);
  const seed = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    pos[i * 3] = (Math.random() - 0.5) * spread[0];
    pos[i * 3 + 1] = y + (Math.random() - 0.5) * spread[1];
    pos[i * 3 + 2] = (Math.random() - 0.5) * spread[2];
    seed[i] = Math.random();
  }
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('seed', new THREE.BufferAttribute(seed, 1));
  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uTime: { value: 0 },
      uColor: { value: new THREE.Color(color) },
      uSize: { value: size * 300 * Math.min(devicePixelRatio, 2) },
      uHeight: { value: spread[1] },
      uY: { value: y },
    },
    vertexShader: /* glsl */ `
      attribute float seed;
      uniform float uTime, uSize, uHeight, uY;
      varying float vAlpha;
      void main() {
        vec3 p = position;
        // Drift upward and sway, wrapping inside the volume.
        p.y = uY - uHeight * 0.5 + mod(p.y - uY + uHeight * 0.5 + uTime * (0.08 + seed * 0.12), uHeight);
        p.x += sin(uTime * 0.3 + seed * 40.0) * 0.25;
        p.z += cos(uTime * 0.25 + seed * 30.0) * 0.2;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = uSize * (0.4 + seed) / -mv.z;
        float edge = smoothstep(0.0, 0.15, (p.y - (uY - uHeight * 0.5)) / uHeight) * smoothstep(1.0, 0.8, (p.y - (uY - uHeight * 0.5)) / uHeight);
        vAlpha = edge * (0.35 + 0.65 * abs(sin(uTime * (0.6 + seed) + seed * 20.0)));
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      varying float vAlpha;
      void main() {
        float d = length(gl_PointCoord - 0.5);
        float a = smoothstep(0.5, 0.0, d);
        gl_FragColor = vec4(uColor * 1.6, a * a * vAlpha);
      }
    `,
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  points.userData.update = (t) => (mat.uniforms.uTime.value = t);
  return points;
}

// Soft volumetric light cone, brightest at its source and fading with distance and at its edges.
export function makeLightShaft({ color = 0xffe7bf, height = 9, radiusTop = 0.15, radiusBottom = 2.6, intensity = 0.35 } = {}) {
  const geo = new THREE.CylinderGeometry(radiusTop, radiusBottom, height, 64, 1, true);
  geo.translate(0, -height / 2, 0);
  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    uniforms: { uColor: { value: new THREE.Color(color) }, uIntensity: { value: intensity }, uTime: { value: 0 } },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      varying vec3 vNormal;
      varying vec3 vView;
      void main() {
        vUv = uv;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vNormal = normalize(normalMatrix * normal);
        vView = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      uniform float uIntensity, uTime;
      varying vec2 vUv;
      varying vec3 vNormal;
      varying vec3 vView;
      void main() {
        float facing = pow(abs(dot(normalize(vNormal), normalize(vView))), 2.0);
        float fall = pow(vUv.y, 1.6);
        float flicker = 0.9 + 0.1 * sin(uTime * 1.3 + vUv.x * 18.0);
        gl_FragColor = vec4(uColor, facing * fall * uIntensity * flicker);
      }
    `,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.userData.update = (t) => (mat.uniforms.uTime.value = t);
  return mesh;
}

export function makePedestal({ radius = 1.7, height = 0.32 } = {}) {
  const g = new THREE.Group();
  const top = new THREE.Mesh(
    new THREE.CylinderGeometry(radius, radius * 1.03, height, 96),
    new THREE.MeshPhysicalMaterial({ color: 0x0c0a09, metalness: 0.3, roughness: 0.16, clearcoat: 1, clearcoatRoughness: 0.05, envMapIntensity: 1.2 })
  );
  top.position.y = -height / 2;
  g.add(top);
  const rim = new THREE.Mesh(
    new THREE.TorusGeometry(radius + 0.005, 0.012, 12, 160),
    new THREE.MeshPhysicalMaterial({ color: 0xc9a96e, metalness: 1, roughness: 0.2, emissive: 0x3a2a10 })
  );
  rim.rotation.x = Math.PI / 2;
  g.add(rim);
  // Floor glow under the pedestal.
  const glowTex = radialTexture('rgba(201,169,110,0.55)', 'rgba(201,169,110,0)');
  const glow = new THREE.Mesh(
    new THREE.PlaneGeometry(radius * 6, radius * 6),
    new THREE.MeshBasicMaterial({ map: glowTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })
  );
  glow.rotation.x = -Math.PI / 2;
  glow.position.y = -height - 0.01;
  g.add(glow);
  return g;
}

export function radialTexture(inner, outer, size = 256) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  const grd = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grd.addColorStop(0, inner);
  grd.addColorStop(1, outer);
  ctx.fillStyle = grd;
  ctx.fillRect(0, 0, size, size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// Warm key, cool rim and an overhead spot: a classic product-photography setup.
export function addStudioLights(scene, { warm = 0xffe2b5, rim = 0x9fb4ff, spot = true } = {}) {
  const key = new THREE.DirectionalLight(warm, 2.2);
  key.position.set(3, 5, 4);
  scene.add(key);
  const back = new THREE.DirectionalLight(rim, 1.4);
  back.position.set(-4, 3, -4);
  scene.add(back);
  scene.add(new THREE.AmbientLight(0xffffff, 0.12));
  if (spot) {
    const s = new THREE.SpotLight(0xfff1d6, 40, 20, Math.PI / 7, 0.6, 1.5);
    s.position.set(0, 8, 1);
    s.target.position.set(0, 0, 0);
    scene.add(s, s.target);
  }
  return { key, back };
}
