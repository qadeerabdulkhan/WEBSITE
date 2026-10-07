import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { config } from './config.js';
import { one, run } from './db.js';

const COOKIE = 'zaqa_session';
const SESSION_DAYS = 30;

const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

// Returns { email } or { phone } for a sign-in identifier, or null if it is neither.
export function parseIdentifier(raw) {
  const value = String(raw || '').trim();
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) && value.length <= 254) return { email: value.toLowerCase() };
  const digits = value.replace(/[\s\-()]/g, '');
  // Pakistani mobile numbers: 03XXXXXXXXX, 923XXXXXXXXX or +923XXXXXXXXX.
  let m = digits.match(/^(?:\+?92|0)(3\d{9})$/);
  if (m) return { phone: `+92${m[1]}` };
  m = digits.match(/^\+(\d{8,15})$/);
  if (m) return { phone: `+${m[1]}` };
  return null;
}

export function publicUser(u) {
  if (!u) return null;
  return { id: u.id, name: u.name, email: u.email, phone: u.phone, role: u.role, address: JSON.parse(u.address || '{}') };
}

export async function hashPassword(password) {
  return bcrypt.hash(password, 11);
}

export async function verifyPassword(password, hash) {
  return bcrypt.compare(password, hash);
}

export function validatePassword(password) {
  if (typeof password !== 'string' || password.length < 8) throw new HttpError(400, 'Password must be at least 8 characters.');
  if (password.length > 200) throw new HttpError(400, 'Password is too long.');
}

export function createSession(res, userId) {
  const token = crypto.randomBytes(32).toString('base64url');
  const expires = Date.now() + SESSION_DAYS * 864e5;
  run('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)', sha256(token), userId, expires);
  res.cookie(COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.production,
    expires: new Date(expires),
    path: '/',
  });
}

export function destroySession(req, res) {
  const token = readCookie(req, COOKIE);
  if (token) run('DELETE FROM sessions WHERE token_hash = ?', sha256(token));
  res.clearCookie(COOKIE, { path: '/' });
}

export function destroyOtherSessions(userId, req) {
  const token = readCookie(req, COOKIE);
  run('DELETE FROM sessions WHERE user_id = ? AND token_hash != ?', userId, sha256(token || ''));
}

function readCookie(req, name) {
  const header = req.headers.cookie || '';
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i > -1 && part.slice(0, i).trim() === name) {
      try {
        return decodeURIComponent(part.slice(i + 1).trim());
      } catch {
        return null;
      }
    }
  }
  return null;
}

// Attaches req.user when a valid session cookie is present.
export function loadUser(req, _res, next) {
  const token = readCookie(req, COOKIE);
  req.user = null;
  if (token) {
    const row = one(
      'SELECT u.* , s.expires_at FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ?',
      sha256(token)
    );
    if (row && row.expires_at > Date.now()) req.user = row;
    else if (row) run('DELETE FROM sessions WHERE token_hash = ?', sha256(token));
  }
  next();
}

export function requireUser(req, _res, next) {
  if (!req.user) return next(new HttpError(401, 'Please sign in.'));
  next();
}

export function requireAdmin(req, _res, next) {
  if (!req.user || req.user.role !== 'admin') return next(new HttpError(403, 'Admin access only.'));
  next();
}

// Small in-memory fixed-window rate limiter, keyed by IP.
export function rateLimit({ windowMs, max }) {
  const hits = new Map();
  setInterval(() => {
    const now = Date.now();
    for (const [k, v] of hits) if (v.reset < now) hits.delete(k);
  }, windowMs).unref();
  return (req, _res, next) => {
    const key = req.ip;
    const now = Date.now();
    let entry = hits.get(key);
    if (!entry || entry.reset < now) {
      entry = { count: 0, reset: now + windowMs };
      hits.set(key, entry);
    }
    if (++entry.count > max) return next(new HttpError(429, 'Too many attempts. Please wait a few minutes and try again.'));
    next();
  };
}
