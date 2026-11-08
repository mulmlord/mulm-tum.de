// Checks a built dist/: every level opens in order with its flag, nothing opens
// out of order or with a wrong flag, each flag is findable where its challenge
// says, and no flag or locked text leaks anywhere else.
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { open } from './site/assets/vault.js';
import { readTextChunks } from './tools/png.mjs';
import { vigenere } from './tools/vigenere.mjs';

const { default: config } = await import('./content/levels.mjs');
const { levels } = config;
const vault = JSON.parse(await readFile('dist/vault.json', 'utf8'));
const flagFor = (via) => levels.find((l) => l.via === via)?.flag;
let checks = 0;
const ok = (message) => { checks++; console.log(`  ok  ${message}`); };

// 1. the chain
assert.equal(vault.total, levels.length);
let token = '';
const opened = [];
for (const [i, level] of levels.entries()) {
  assert.equal(await open(vault.levels[i], token, 'mulm{wrong_flag}'), null, `level ${i + 1} opened with a wrong flag`);
  const payload = await open(vault.levels[i], token, `  ${level.flag.toUpperCase()} `);
  assert.ok(payload, `level ${i + 1} did not open with its flag`);
  opened.push(payload);
  token = payload.token;
}
ok(`all ${levels.length} levels open in order; wrong flags are rejected; flags ignore case and spaces`);

for (let i = 1; i < levels.length; i++) {
  assert.equal(await open(vault.levels[i], '', levels[i].flag), null, `level ${i + 1} opened without level ${i}`);
}
ok('no level opens without the one before it');

// 2. each flag is where its challenge points
const planted = new Map(); // flag -> files allowed to contain it in plain text
const read = (path) => readFile(join('dist', path));

if (flagFor('source-comment')) {
  const comments = (await read('index.html')).toString().match(/<!--[\s\S]*?-->/g) ?? [];
  assert.ok(comments.some((c) => c.includes(flagFor('source-comment'))), 'flag is not in an HTML comment');
  planted.set(flagFor('source-comment'), ['index.html']);
  ok('source-comment: flag is in an HTML comment on the landing page');
}
if (flagFor('robots')) {
  assert.match((await read('robots.txt')).toString(), new RegExp(`Disallow: /${config.robotsPath}/`));
  assert.ok((await read(`${config.robotsPath}/index.html`)).toString().includes(flagFor('robots')));
  planted.set(flagFor('robots'), [`${config.robotsPath}/index.html`]);
  ok('robots: robots.txt points to the page with the flag');
}
if (flagFor('console')) {
  const b64 = (await read('assets/console.js')).toString().match(/"([A-Za-z0-9+/=]+)"/)[1];
  assert.equal(Buffer.from(b64, 'base64').toString(), flagFor('console'));
  ok('console: the Base64 message decodes to the flag');
}
if (flagFor('png-metadata')) {
  assert.equal(readTextChunks(await read('assets/picture.png')).Comment, flagFor('png-metadata'));
  planted.set(flagFor('png-metadata'), ['assets/picture.png']);
  ok('png-metadata: the picture carries the flag in a Comment chunk');
}
if (flagFor('vigenere')) {
  const i = levels.findIndex((l) => l.via === 'vigenere');
  const cipher = opened[i - 1].challenge.match(/mulm\{([a-z_]+)\}/)[1];
  assert.equal(`mulm{${vigenere(cipher, config.vigenereKey, { decrypt: true })}}`, flagFor('vigenere'));
  assert.ok(opened.slice(0, i - 1).some((l) => l.body.includes(config.vigenereKey)), 'the key is never revealed before the cipher');
  ok('vigenere: the cipher decrypts to the flag with a key revealed in an earlier level');
}

// 3. nothing leaks
const files = (await readdir('dist', { recursive: true, withFileTypes: true }))
  .filter((d) => d.isFile())
  .map((d) => join(d.parentPath, d.name).slice('dist/'.length));
for (const file of files) {
  const text = (await read(file)).toString(file.endsWith('.png') ? 'latin1' : 'utf8');
  for (const level of levels) {
    const allowed = planted.get(level.flag) ?? [];
    assert.ok(!text.includes(level.flag) || allowed.includes(file), `${level.flag} leaks in ${file}`);
  }
  for (const [i, level] of opened.entries()) {
    const snippet = level.body.trim().slice(0, 60);
    assert.ok(!text.includes(snippet), `level ${i + 1} text leaks in ${file}`);
  }
}
ok(`no flag or locked text in plain sight across ${files.length} published files`);

console.log(`\n${checks} checks passed`);

