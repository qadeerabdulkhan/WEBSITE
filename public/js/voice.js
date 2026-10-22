// "Talk to ZAQA": a floating call button that opens a hands-free voice chat with the store assistant.
// The browser does speech recognition and speech synthesis; the server runs the conversation.
import { html, raw, setHTML, $, toast } from './util.js';
import { api, ApiError } from './api.js';
import { cart } from './cart.js';

const ICONS = {
  phone: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z"/></svg>',
  mic: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg>',
  micOff: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M9 9V6a3 3 0 0 1 6 0v5M15 14a3 3 0 0 1-6-1M5 11a7 7 0 0 0 11.5 5.4M19 11a7 7 0 0 1-.5 2.6M12 18v3M4 4l16 16"/></svg>',
  speaker: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M4 10h4l5-4v12l-5-4H4z"/><path d="M16 9a4 4 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11"/></svg>',
  speakerOff: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M4 10h4l5-4v12l-5-4H4z"/><path d="M17 10l4 4M21 10l-4 4"/></svg>',
  hangup: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M3 14c5-5 13-5 18 0l-2.5 2.5-3-1.5v-2.5a10 10 0 0 0-5 0V15l-3 1.5z"/></svg>',
  send: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M4 12l16-8-6 16-2-6z"/></svg>',
};

const NUDGES = {
  unpaid: 'You have an unpaid order. Want a hand finishing it?',
  confirm: 'Thanks for your order! Tap to confirm your delivery details.',
};

const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
const synth = window.speechSynthesis;

function storeGet(k) {
  try { return sessionStorage.getItem(k); } catch { return null; }
}
function storeSet(k, v) {
  try { sessionStorage.setItem(k, v); } catch { /* ignore */ }
}

function pickVoice() {
  const voices = synth?.getVoices() || [];
  const en = voices.filter((v) => /^en[-_]/i.test(v.lang));
  return en.find((v) => /natural|neural|google/i.test(v.name)) || en.find((v) => v.default) || en[0] || null;
}

export async function mountVoiceAgent() {
  if (document.getElementById('voice-agent')) return;
  const status = await api('/voice/status').catch(() => null);
  if (!status?.enabled) return;

  const root = document.createElement('div');
  root.id = 'voice-agent';
  setHTML(
    root,
    html`<div class="va-nudge" hidden><button class="va-nudge-text" type="button"></button><button class="va-nudge-x" type="button" aria-label="Dismiss">×</button></div>
    <button class="va-fab" type="button" aria-haspopup="dialog" aria-controls="va-panel">${raw(ICONS.phone)}<span>Talk to ZAQA</span></button>
    <section class="va-panel" id="va-panel" role="dialog" aria-label="ZAQA voice assistant" hidden>
      <header class="va-head">
        <div class="va-orb" aria-hidden="true"></div>
        <div><strong>ZAQA assistant</strong><span class="va-state" aria-live="polite">Ready</span></div>
      </header>
      <div class="va-log" aria-live="polite"></div>
      <form class="va-input">
        <input type="text" maxlength="600" placeholder="${Recognition ? 'Speak, or type here…' : 'Type your question…'}" aria-label="Message">
        <button type="submit" class="va-btn" aria-label="Send">${raw(ICONS.send)}</button>
      </form>
      <div class="va-controls">
        <button type="button" class="va-btn va-mic" ${Recognition ? '' : raw('hidden')}></button>
        <button type="button" class="va-btn va-speaker" ${synth ? '' : raw('hidden')}></button>
        <button type="button" class="va-btn va-hangup" aria-label="End call">${raw(ICONS.hangup)}<span>End</span></button>
      </div>
    </section>`
  );
  document.body.append(root);

  const fab = $('.va-fab', root);
  const panel = $('.va-panel', root);
  const log = $('.va-log', root);
  const stateEl = $('.va-state', root);
  const form = $('.va-input', root);
  const input = $('input', form);
  const micBtn = $('.va-mic', root);
  const speakerBtn = $('.va-speaker', root);
  const nudge = $('.va-nudge', root);

  let convoId = null;
  let busy = false;
  let micOn = !!Recognition;
  let speakerOn = !!synth;
  let recognizer = null;
  let listening = false;
  let pendingNav = null;

  const setState = (text, mode = '') => {
    stateEl.textContent = text;
    root.dataset.mode = mode;
  };

  const renderToggles = () => {
    setHTML(micBtn, raw(`${micOn ? ICONS.mic : ICONS.micOff}<span>${micOn ? 'Mute' : 'Unmute'}</span>`));
    micBtn.setAttribute('aria-pressed', String(!micOn));
    setHTML(speakerBtn, raw(`${speakerOn ? ICONS.speaker : ICONS.speakerOff}<span>${speakerOn ? 'Voice on' : 'Voice off'}</span>`));
    speakerBtn.setAttribute('aria-pressed', String(!speakerOn));
  };
  renderToggles();

  const say = (who, text) => {
    const p = document.createElement('p');
    p.className = `va-msg va-${who}`;
    p.textContent = text;
    log.append(p);
    log.scrollTop = log.scrollHeight;
  };

  // ---- Nudge (the in-browser version of a follow-up call) ----
  if (status.nudge && !storeGet(`va-nudge-${status.nudge}`)) {
    $('.va-nudge-text', root).textContent = NUDGES[status.nudge];
    setTimeout(() => (nudge.hidden = false), 2500);
  }
  const dismissNudge = () => {
    nudge.hidden = true;
    if (status.nudge) storeSet(`va-nudge-${status.nudge}`, '1');
  };
  $('.va-nudge-x', root).addEventListener('click', dismissNudge);
  $('.va-nudge-text', root).addEventListener('click', () => {
    dismissNudge();
    startCall();
  });

  // ---- Speech ----
  function speak(text) {
    return new Promise((resolve) => {
      if (!speakerOn || !synth) return resolve();
      synth.cancel();
      const u = new SpeechSynthesisUtterance(text);
      const voice = pickVoice();
      if (voice) {
        u.voice = voice;
        u.lang = voice.lang;
      } else u.lang = 'en-US';
      u.rate = 1.02;
      u.onend = u.onerror = () => resolve();
      setState('Speaking…', 'speaking');
      synth.speak(u);
    });
  }

  function listen() {
    if (!convoId || !micOn || !Recognition || busy || listening) return;
    recognizer = new Recognition();
    recognizer.lang = /^en/i.test(navigator.language) ? navigator.language : 'en-US';
    recognizer.interimResults = true;
    recognizer.maxAlternatives = 1;
    let finalText = '';
    recognizer.onresult = (e) => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) finalText += e.results[i][0].transcript;
        else interim += e.results[i][0].transcript;
      }
      input.value = (finalText + interim).trim();
    };
    recognizer.onerror = (e) => {
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
        micOn = false;
        renderToggles();
        toast('Microphone access was blocked. You can type instead.', { error: true });
      }
    };
    recognizer.onend = () => {
      listening = false;
      recognizer = null;
      const text = finalText.trim();
      if (text) send(text);
      // Nothing heard: keep the line open.
      else if (convoId && micOn && !busy && !panel.hidden) setTimeout(listen, 250);
    };
    try {
      recognizer.start();
      listening = true;
      setState('Listening…', 'listening');
    } catch {
      listening = false;
    }
  }

  function stopListening() {
    if (recognizer) {
      recognizer.onend = () => { listening = false; recognizer = null; };
      try { recognizer.abort(); } catch { /* ignore */ }
    }
    listening = false;
  }

  // ---- Conversation ----
  async function afterReply(text, actions = []) {
    for (const a of actions) {
      if (a.type === 'add_to_cart') {
        cart.add(a.slug, a.qty);
        toast(`Added ${a.name} to your bag`, { action: { href: '/cart', label: 'View bag' } });
      }
      if (a.type === 'navigate') pendingNav = a.href;
    }
    await speak(text);
    if (!convoId) return (pendingNav = null);
    if (pendingNav) {
      const href = pendingNav;
      pendingNav = null;
      endCall();
      location.href = href;
      return;
    }
    setState(micOn ? 'Listening…' : 'Your turn', micOn ? 'listening' : '');
    listen();
  }

  async function send(text) {
    if (!convoId || busy || !text) return;
    stopListening();
    input.value = '';
    say('user', text);
    busy = true;
    setState('Thinking…', 'thinking');
    try {
      const out = await api('/voice/message', { method: 'POST', body: { id: convoId, text } });
      busy = false;
      say('agent', out.text);
      await afterReply(out.text, out.actions);
    } catch (err) {
      busy = false;
      const msg = err instanceof ApiError ? err.message : 'Connection problem. Please try again.';
      say('system', msg);
      if (err instanceof ApiError && err.status === 410) return endCall();
      setState('Your turn');
      listen();
    }
  }

  async function startCall() {
    panel.hidden = false;
    fab.hidden = true;
    nudge.hidden = true;
    if (convoId) return;
    log.textContent = '';
    setState('Connecting…', 'thinking');
    try {
      const out = await api('/voice/start', { method: 'POST', body: {} });
      convoId = out.id;
      say('agent', out.text);
      await afterReply(out.text);
    } catch (err) {
      say('system', err instanceof ApiError ? err.message : 'Could not connect. Please try again.');
      setState('Not connected');
    }
  }

  function endCall() {
    stopListening();
    synth?.cancel();
    if (convoId) api('/voice/end', { method: 'POST', body: { id: convoId } }).catch(() => {});
    convoId = null;
    busy = false;
    panel.hidden = true;
    fab.hidden = false;
    setState('Ready');
  }

  fab.addEventListener('click', startCall);
  $('.va-hangup', root).addEventListener('click', endCall);
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    send(input.value.trim());
  });
  input.addEventListener('focus', () => {
    // Typing takes over from the microphone until the next reply.
    stopListening();
    if (convoId && !busy) setState('Your turn');
  });
  micBtn.addEventListener('click', () => {
    micOn = !micOn;
    renderToggles();
    if (micOn) listen();
    else {
      stopListening();
      if (!busy) setState('Your turn');
    }
  });
  speakerBtn.addEventListener('click', () => {
    speakerOn = !speakerOn;
    if (!speakerOn) synth?.cancel();
    renderToggles();
  });
  document.addEventListener('keydown', (e) => e.key === 'Escape' && !panel.hidden && endCall());
}
