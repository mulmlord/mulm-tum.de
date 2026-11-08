// Builds the publishable site into dist/:
//   - copies site/ (the public engine)
//   - plants each flag in its challenge (see `via` in content/levels.mjs)
//   - encrypts all levels into dist/vault.json
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { seal } from './site/assets/vault.js';
import { addTextChunk, createPng } from './tools/png.mjs';
import { vigenere } from './tools/vigenere.mjs';

const CONTENT = new URL('./content/levels.mjs', import.meta.url);
const PHOTO = new URL('./content/photo.png', import.meta.url);
const DIST = 'dist';

if (!existsSync(CONTENT)) {
  console.error('content/levels.mjs is missing. It holds the private levels and flags.');
  process.exit(1);
}
const { default: config } = await import(CONTENT);
const { domain, levels } = config;

// --- validate -------------------------------------------------------------
const FLAG = /^mulm\{[^\s{}]+\}$/;
const VIAS = ['source-comment', 'robots', 'console', 'png-metadata', 'dns-txt', 'vigenere'];
const seen = new Set();
for (const [i, level] of levels.entries()) {
  const where = `level ${i + 1}`;
  if (!FLAG.test(level.flag)) throw new Error(`${where}: flag must look like mulm{...}`);
  if (!VIAS.includes(level.via)) throw new Error(`${where}: unknown via "${level.via}"`);
  if (seen.has(level.via)) throw new Error(`${where}: via "${level.via}" is used twice`);
  seen.add(level.via);
  if (i < levels.length - 1 && !level.challenge) throw new Error(`${where}: needs a challenge for the next level`);
}
const flagFor = (via) => levels.find((l) => l.via === via)?.flag;
const inner = (flag) => flag.slice('mulm{'.length, -1);

if (flagFor('vigenere')) {
  if (!/^[a-z_]+$/.test(inner(flagFor('vigenere')))) throw new Error('vigenere flag: use only a-z and _ inside the braces');
  if (!/^[a-z]+$/i.test(config.vigenereKey)) throw new Error('vigenereKey: letters only');
}

// --- copy the public engine -----------------------------------------------
await rm(DIST, { recursive: true, force: true });
await cp('site', DIST, { recursive: true });

const vars = {
  image: '/assets/picture.png',
  dnsHost: `${config.dnsName}.${domain}`,
  vigenereKey: config.vigenereKey,
  vigenere: flagFor('vigenere') ? `mulm{${vigenere(inner(flagFor('vigenere')), config.vigenereKey)}}` : '',
};
const fill = (html) =>
  html?.replace(/\{\{(\w+)\}\}/g, (match, name) => {
    if (!(name in vars)) throw new Error(`Unknown placeholder ${match}`);
    return vars[name];
  }) ?? null;

// --- plant the flags --------------------------------------------------------
const notes = [];

// source-comment: an HTML comment in the landing page
const indexPath = `${DIST}/index.html`;
let index = await readFile(indexPath, 'utf8');
const comment = flagFor('source-comment') ? `<!-- note to self: remove this test flag before going live: ${flagFor('source-comment')} -->` : '';
index = index.replace('<!-- {{source-comment}} -->', comment);
await writeFile(indexPath, index);

// robots: a page that robots.txt tells crawlers to avoid
const robotsFlag = flagFor('robots');
await writeFile(
  `${DIST}/robots.txt`,
  robotsFlag ? `User-agent: *\nDisallow: /${config.robotsPath}/\n` : 'User-agent: *\nDisallow:\n',
);
if (robotsFlag) {
  await mkdir(`${DIST}/${config.robotsPath}`, { recursive: true });
  await writeFile(`${DIST}/${config.robotsPath}/index.html`, robotsPage(robotsFlag));
}

// console: a Base64 message logged by assets/console.js
const consoleFlag = flagFor('console');
await writeFile(
  `${DIST}/assets/console.js`,
  consoleFlag
    ? [
        `console.log('%c> hello, developer.', 'color:#5af78e;font:600 15px ui-monospace,monospace');`,
        `console.log('Curious, huh? Here is something for you. It is encoded, not encrypted:');`,
        `console.log(${JSON.stringify(Buffer.from(consoleFlag).toString('base64'))});`,
        '',
      ].join('\n')
    : '',
);

// png-metadata: a tEXt "Comment" chunk in the picture
const pngFlag = flagFor('png-metadata');
if (pngFlag) {
  const base = existsSync(PHOTO) ? await readFile(PHOTO) : glitchPicture();
  await writeFile(`${DIST}${vars.image}`, addTextChunk(base, 'Comment', pngFlag));
}

// dns-txt: has to be added by hand at the DNS provider
if (flagFor('dns-txt')) notes.push(`DNS: TXT record  ${vars.dnsHost}  ->  "${flagFor('dns-txt')}"`);

// --- encrypt the levels -----------------------------------------------------
let token = '';
const boxes = [];
for (const level of levels) {
  const next = randomBytes(16).toString('hex');
  const payload = {
    title: level.title,
    body: fill(level.body),
    challenge: fill(level.challenge),
    hint: fill(level.hint),
    token: next,
  };
  boxes.push(await seal(payload, token, level.flag));
  token = next;
}
await writeFile(`${DIST}/vault.json`, JSON.stringify({ v: 1, total: levels.length, levels: boxes }));

// --- hosting files ----------------------------------------------------------
await writeFile(`${DIST}/CNAME`, `${domain}\n`); // GitHub Pages custom domain
await writeFile(`${DIST}/.nojekyll`, '');

console.log(`built ${levels.length} levels into ${DIST}/`);
for (const note of notes) console.log(`manual step  ${note}`);

// --- helpers ----------------------------------------------------------------
function robotsPage(flag) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Not for robots</title>
<link rel="stylesheet" href="/assets/style.css">
</head>
<body>
<div class="wrap">
  <main class="level">
    <p class="prompt"><span>$</span>cat /${config.robotsPath}/note.txt</p>
    <h1>Beep boop. You're not a robot, are you?</h1>
    <p>Good. Robots were told to stay away from this page. You weren't.</p>
    <p>Your flag: <code class="flag-text">${flag}</code></p>
    <p><a href="/">&larr; back to the start</a></p>
  </main>
</div>
</body>
</html>
`;
}

// A placeholder image: green interference waves with glitched rows and scanlines.
function glitchPicture() {
  const W = 640;
  const H = 360;
  const noise = (n) => {
    const s = Math.sin(n * 127.1) * 43758.5453;
    return s - Math.floor(s);
  };
  return createPng(W, H, (x, y) => {
    const band = Math.floor(y / 12);
    const shift = noise(band) > 0.85 ? Math.floor((noise(band + 99) - 0.5) * 140) : 0;
    const gx = x + shift;
    const wave =
      Math.sin(gx * 0.035 + Math.sin(y * 0.018) * 3.2) * 0.6 +
      Math.sin(Math.hypot(gx - 420, y - 150) * 0.06) * 0.4;
    const glow = Math.max(0, wave) ** 2.4;
    const scan = y % 3 === 0 ? 0.55 : 1;
    const clamp = (v) => Math.max(0, Math.min(255, Math.round(v)));
    return [
      clamp((10 + 40 * glow) * scan),
      clamp((14 + 230 * glow) * scan),
      clamp((11 + 110 * glow) * scan),
    ];
  });
}
