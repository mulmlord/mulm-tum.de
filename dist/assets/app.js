import { normalizeFlag, open } from './vault.js';

const STORAGE_KEY = 'mulm-ctf:flags';

const $ = (selector) => document.querySelector(selector);
const els = {
  levels: $('#levels'),
  form: $('#flag-form'),
  field: $('#flag-form .field'),
  input: $('#flag'),
  button: $('#flag-form button'),
  status: $('#status'),
  progressText: $('#progress-text'),
  progressBar: $('#progress-bar'),
  complete: $('#complete'),
  reset: $('#reset'),
};

// token: secret from the last opened level, needed to open the next one
const state = { vault: null, token: '', flags: [], busy: false };

// Progress is a convenience only; private windows may block storage.
const storage = {
  load() {
    try {
      const flags = JSON.parse(localStorage.getItem(STORAGE_KEY));
      return Array.isArray(flags) ? flags : [];
    } catch {
      return [];
    }
  },
  save(flags) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(flags)); } catch { /* not kept */ }
  },
  clear() {
    try { localStorage.removeItem(STORAGE_KEY); } catch { /* nothing to clear */ }
  },
};

const pad = (n) => String(n).padStart(2, '0');

function setStatus(text, kind = '') {
  els.status.textContent = text;
  els.status.className = kind;
}

function renderProgress() {
  const { total } = state.vault;
  const done = state.flags.length;
  els.progressText.textContent = `level ${done} / ${total}`;
  els.progressBar.replaceChildren(
    ...Array.from({ length: total }, (_, i) => {
      const li = document.createElement('li');
      if (i < done) li.className = 'done';
      return li;
    }),
  );
}

function renderLevel(level, n, fresh) {
  for (const c of document.querySelectorAll('.challenge:not(.solved)')) c.classList.add('solved');

  const section = document.createElement('section');
  section.className = fresh ? 'level fresh' : 'level';
  section.id = `level-${n}`;

  const prompt = document.createElement('p');
  prompt.className = 'prompt';
  prompt.innerHTML = '<span>$</span>';
  prompt.append(level.title);

  // Level HTML is written by the site owner and comes out of the vault.
  const body = document.createElement('div');
  body.className = 'body';
  body.innerHTML = level.body;
  section.append(prompt, body);

  if (level.challenge) {
    const challenge = document.createElement('div');
    challenge.className = 'challenge';
    challenge.innerHTML =
      `<h2>challenge ${pad(n + 1)}</h2>${level.challenge}` +
      (level.hint ? `<details><summary>hint</summary>${level.hint}</details>` : '');
    section.append(challenge);
  }

  els.levels.append(section);
  return section;
}

async function unlock(flag) {
  const box = state.vault.levels[state.flags.length];
  if (!box) return null;
  const level = await open(box, state.token, flag);
  if (!level) return null;
  state.token = level.token;
  state.flags.push(flag);
  return { level, n: state.flags.length };
}

function finishIfDone() {
  if (state.flags.length < state.vault.total) return;
  els.form.hidden = true;
  els.complete.hidden = false;
}

function reject(flag) {
  const already = state.flags.some((f) => normalizeFlag(f) === normalizeFlag(flag));
  const wellFormed = /^mulm\{.+\}$/i.test(flag);
  setStatus(
    already ? 'You already captured that one.'
      : wellFormed ? 'Access denied. Not the flag for this level.'
      : 'Access denied. Flags look like mulm{...}',
    'err',
  );
  els.field.classList.remove('shake');
  void els.field.offsetWidth; // restart the animation
  els.field.classList.add('shake');
}

async function onSubmit(event) {
  event.preventDefault();
  const flag = els.input.value.trim();
  if (!flag || state.busy) return;
  if (!state.vault) return setStatus('Still loading, one second.');

  state.busy = true;
  els.button.disabled = true;
  setStatus('checking…');
  const result = await unlock(flag);
  state.busy = false;
  els.button.disabled = false;

  if (!result) return reject(flag);

  els.field.classList.remove('shake');
  storage.save(state.flags);
  els.input.value = '';
  const section = renderLevel(result.level, result.n, true);
  renderProgress();
  setStatus(`Flag accepted. Level ${result.n} unlocked.`, 'ok');
  finishIfDone();
  const smooth = !matchMedia('(prefers-reduced-motion: reduce)').matches;
  section.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto', block: 'start' });
}

async function restore() {
  const saved = storage.load();
  if (!saved.length) return;
  setStatus('restoring progress…');
  for (const flag of saved) {
    const result = await unlock(flag);
    if (!result) break; // the site changed since the last visit
    renderLevel(result.level, result.n, false);
  }
  storage.save(state.flags);
  setStatus('');
}

async function main() {
  els.form.addEventListener('submit', onSubmit);
  els.input.addEventListener('input', () => {
    els.field.classList.remove('shake');
    if (els.status.classList.contains('err')) setStatus('');
  });
  els.reset.addEventListener('click', () => {
    storage.clear();
    location.reload();
  });

  try {
    const response = await fetch(new URL('../vault.json', import.meta.url), { cache: 'no-cache' });
    if (!response.ok) throw new Error(response.statusText);
    state.vault = await response.json();
  } catch {
    setStatus('Could not load the levels. Try reloading the page.', 'err');
    return;
  }

  renderProgress();
  await restore();
  renderProgress();
  finishIfDone();
}

main();
