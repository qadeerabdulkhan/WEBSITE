// Resets the admin login to ADMIN_EMAIL / ADMIN_PASSWORD from .env, keeping all store data.
// Usage: npm run reset-admin
import bcrypt from 'bcryptjs';
import { config } from './config.js';
import { one, run } from './db.js';

const email = config.admin.email.trim().toLowerCase();
const password = config.admin.password;

if (!password || password.length < 8) {
  console.error('\n  Set ADMIN_PASSWORD (at least 8 characters) in your .env file first, then run this again.\n');
  process.exit(1);
}

const hash = bcrypt.hashSync(password, 11);
const byEmail = one('SELECT * FROM users WHERE email = ?', email);
const anyAdmin = one("SELECT * FROM users WHERE role = 'admin' ORDER BY id LIMIT 1");
const user = byEmail || anyAdmin;

if (user) {
  run("UPDATE users SET email = ?, password_hash = ?, role = 'admin' WHERE id = ?", email, hash, user.id);
  run('DELETE FROM sessions WHERE user_id = ?', user.id);
} else {
  run("INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, 'admin')", config.admin.name, email, hash);
}

console.log(`\n  Admin login reset. Sign in with:\n    Email:    ${email}\n    Password: the ADMIN_PASSWORD in your .env file\n`);
