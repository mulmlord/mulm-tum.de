// Locks and unlocks levels. Shared by the browser (app.js) and the build (build.mjs).
//
// Each level is AES-GCM encrypted with a key derived (PBKDF2) from
// "<token of the previous level>:<flag>". The token is a random secret that only
// exists inside the previous level's encrypted payload, so a level cannot be
// opened without having opened every level before it, even by someone who
// reads all of this site's files.

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const ITERATIONS = 150_000;

export const normalizeFlag = (flag) => flag.trim().toLowerCase();

function toBase64(bytes) {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

function fromBase64(text) {
  const s = atob(text);
  const bytes = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) bytes[i] = s.charCodeAt(i);
  return bytes;
}

async function deriveKey(token, flag, salt, iterations, usage) {
  const material = await crypto.subtle.importKey(
    'raw',
    encoder.encode(`${token}:${normalizeFlag(flag)}`),
    'PBKDF2',
    false,
    ['deriveKey'],
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    [usage],
  );
}

export async function seal(payload, token, flag) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(token, flag, salt, ITERATIONS, 'encrypt');
  const data = encoder.encode(JSON.stringify(payload));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, data));
  return { it: ITERATIONS, salt: toBase64(salt), iv: toBase64(iv), ct: toBase64(ct) };
}

// Returns the level payload, or null if the flag (or token) is wrong.
export async function open(box, token, flag) {
  const key = await deriveKey(token, flag, fromBase64(box.salt), box.it, 'decrypt');
  try {
    const data = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromBase64(box.iv) }, key, fromBase64(box.ct));
    return JSON.parse(decoder.decode(data));
  } catch {
    return null;
  }
}
