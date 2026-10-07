// Vector rebuild of the ZAQA "ZQ" monogram (Bodoni Z/Q with the "Fragrances by Zaqa" script),
// so it stays sharp at any size and can be used as a 3D texture.
const LETTERS = { z: { x: 45, y: 138, size: 140 }, q: { x: 86, y: 157, size: 112 }, script: { x: 101, y: 120, size: 17 } };

export function logoSvg({ title = 'ZAQA — Fragrances by Zaqa', className = 'logo-mark' } = {}) {
  const { z, q, script } = LETTERS;
  return `<svg class="${className}" viewBox="0 0 200 200" role="img" aria-label="${title}">
    <text x="${z.x}" y="${z.y}" font-family="'Bodoni Moda', 'Didot', serif" font-size="${z.size}" fill="currentColor">Z</text>
    <text x="${q.x}" y="${q.y}" font-family="'Bodoni Moda', 'Didot', serif" font-size="${q.size}" fill="currentColor">Q</text>
    <text class="script" x="${script.x}" y="${script.y}" text-anchor="middle" font-family="'Pinyon Script', cursive"
      font-size="${script.size}" stroke-width="7" paint-order="stroke" stroke-linejoin="round">Fragrances by Zaqa</text>
  </svg>`;
}

let fontsReady;
export function loadLogoFonts() {
  return (fontsReady ||= Promise.all([
    document.fonts.load('140px "Bodoni Moda"'),
    document.fonts.load('17px "Pinyon Script"'),
    document.fonts.load('600 40px "Cormorant Garamond"'),
  ]).catch(() => null));
}

// Draws the monogram into a 2D canvas context, inside a square of `size` px at (ox, oy).
export function drawLogo(ctx, { ox = 0, oy = 0, size = 200, ink = '#e8d3a4', script = '#f5ead2', cut = null } = {}) {
  const k = size / 200;
  const { z, q, script: s } = LETTERS;
  ctx.save();
  ctx.translate(ox, oy);
  ctx.scale(k, k);
  ctx.fillStyle = ink;
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';
  ctx.font = `${z.size}px "Bodoni Moda", Didot, serif`;
  ctx.fillText('Z', z.x, z.y);
  ctx.font = `${q.size}px "Bodoni Moda", Didot, serif`;
  ctx.fillText('Q', q.x, q.y);
  ctx.font = `${s.size}px "Pinyon Script", cursive`;
  ctx.textAlign = 'center';
  if (cut) {
    ctx.lineWidth = 7;
    ctx.lineJoin = 'round';
    ctx.strokeStyle = cut;
    ctx.strokeText('Fragrances by Zaqa', s.x, s.y);
  } else {
    // No background colour to "cut" with: erase a band so the script reads over the letters.
    ctx.globalCompositeOperation = 'destination-out';
    ctx.lineWidth = 7;
    ctx.lineJoin = 'round';
    ctx.strokeText('Fragrances by Zaqa', s.x, s.y);
    ctx.globalCompositeOperation = 'source-over';
  }
  ctx.fillStyle = script;
  ctx.fillText('Fragrances by Zaqa', s.x, s.y);
  ctx.restore();
}
