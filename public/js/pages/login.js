import { api } from '../api.js';
import { $, $$, setHTML, params } from '../util.js';
import { logoSvg } from '../logo.js';
import { guardWebGL } from '../three/core.js';

setHTML($('#auth-logo'), logoSvg());
if (guardWebGL()) import('../three/scenes.js').then(({ loginScene }) => loginScene($('#stage')));

let mode = 'login';
let idType = 'email';
const form = $('#auth-form');
const idInput = $('#identifier');
const err = $('#auth-error');

function setMode(m) {
  mode = m;
  $('#tab-login').setAttribute('aria-selected', m === 'login');
  $('#tab-register').setAttribute('aria-selected', m === 'register');
  $('#name-field').hidden = m === 'login';
  $('#auth-title').textContent = m === 'login' ? 'Welcome back' : 'Create your account';
  $('#auth-sub').textContent = m === 'login' ? 'Sign in with your email or mobile number.' : 'Join ZAQA with your email or mobile number.';
  $('#auth-submit').textContent = m === 'login' ? 'Sign in' : 'Create account';
  $('#password').autocomplete = m === 'login' ? 'current-password' : 'new-password';
  $('#password').placeholder = m === 'login' ? '' : 'At least 8 characters';
  err.textContent = '';
}

function setIdType(t) {
  idType = t;
  $$('.id-switch button').forEach((b) => b.setAttribute('aria-pressed', b.dataset.id === t));
  $('#identifier-label').textContent = t === 'email' ? 'Email address' : 'Mobile number';
  idInput.type = t === 'email' ? 'email' : 'tel';
  idInput.inputMode = t === 'email' ? 'email' : 'tel';
  idInput.placeholder = t === 'email' ? 'you@example.com' : '03xx xxxxxxx';
  idInput.value = '';
}

$('#tab-login').onclick = () => setMode('login');
$('#tab-register').onclick = () => setMode('register');
$$('.id-switch button').forEach((b) => (b.onclick = () => setIdType(b.dataset.id)));
$('#pw-toggle').onclick = () => {
  const pw = $('#password');
  pw.type = pw.type === 'password' ? 'text' : 'password';
  $('#pw-toggle').textContent = pw.type === 'password' ? 'Show' : 'Hide';
};
if (params().get('mode') === 'register') setMode('register');

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  err.textContent = '';
  const identifier = idInput.value.trim();
  const password = $('#password').value;
  const name = $('#name').value.trim();
  if (mode === 'register' && !name) return (err.textContent = 'Please enter your name.');
  if (!identifier) return (err.textContent = idType === 'email' ? 'Please enter your email.' : 'Please enter your mobile number.');
  if (password.length < 8) return (err.textContent = 'Password must be at least 8 characters.');
  const btn = $('#auth-submit');
  btn.disabled = true;
  try {
    const { user } = await api(mode === 'login' ? '/auth/login' : '/auth/register', {
      method: 'POST',
      body: { identifier, password, name },
    });
    const next = params().get('next');
    // Only follow same-site relative redirects.
    const safeNext = next && /^\/(?!\/)/.test(next) && !next.startsWith('/login') ? next : null;
    location.href = safeNext || (user.role === 'admin' ? '/admin' : '/');
  } catch (ex) {
    err.textContent = ex.message;
    btn.disabled = false;
  }
});
