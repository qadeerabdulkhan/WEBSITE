import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { HttpError } from './auth.js';

// Validates a PNG/JPEG/WebP data URL by its magic bytes and writes it to dir under a random name.
export function saveImageDataUrl(dataUrl, dir, maxBytes = 4 * 1024 * 1024) {
  const m = /^data:(image\/(png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/.exec(String(dataUrl || ''));
  if (!m) throw new HttpError(400, 'Upload a PNG, JPEG or WebP image.');
  const buf = Buffer.from(m[3], 'base64');
  if (buf.length > maxBytes) throw new HttpError(400, 'Image must be under 4 MB.');
  const sig = buf.subarray(0, 12);
  const valid =
    (m[2] === 'png' && sig.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) ||
    (m[2] === 'jpeg' && sig[0] === 0xff && sig[1] === 0xd8) ||
    (m[2] === 'webp' && sig.toString('ascii', 0, 4) === 'RIFF' && sig.toString('ascii', 8, 12) === 'WEBP');
  if (!valid) throw new HttpError(400, 'That file is not a valid image.');
  const name = `${crypto.randomBytes(12).toString('hex')}.${m[2] === 'jpeg' ? 'jpg' : m[2]}`;
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, name), buf);
  return name;
}
