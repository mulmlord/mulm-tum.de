# mulm-tum.de

A personal website built as a capture-the-flag: every flag a visitor finds unlocks
the next level and a bit more about me.

## How it works

- `site/` is the public part: landing page (level 0), styles, and the browser logic.
- `content/levels.mjs` is **private**. It holds every flag and all locked text, and is
  git-ignored. Keep a backup somewhere safe, because it exists nowhere else.
- `npm run build` creates `dist/`, the folder that gets published:
  - each flag is planted in its challenge (HTML comment, robots.txt page, console
    message, image metadata, Vigenère cipher)
  - all levels are encrypted into `dist/vault.json` (AES-GCM, key = PBKDF2 of the
    previous level's secret token + the flag), so reading the site's files does not
    reveal locked levels or let anyone skip ahead.

## Commands

```sh
npm run preview   # build and serve at http://localhost:4173
npm test          # build and check the flag chain and that nothing leaks
```

## Challenges

| unlocks  | hidden in              | how to find it                        |
| -------- | ---------------------- | ------------------------------------- |
| level 1  | HTML comment           | view page source                      |
| level 2  | `/no-robots-allowed/`  | read `/robots.txt`                    |
| level 3  | browser console        | DevTools, then decode Base64          |
| level 4  | `assets/picture.png`   | image metadata (`exiftool`, `strings`)|
| level 5  | DNS TXT `_flag.mulm-tum.de` | `dig TXT _flag.mulm-tum.de`      |
| level 6  | Vigenère cipher        | key = the word revealed in level 4    |

The level 5 flag only exists once the TXT record is added in the IONOS DNS settings;
`npm run build` prints the exact record.

## Editing

- Text about me, flags, titles, hints: `content/levels.mjs`
- Your own picture for challenge 4: put a PNG at `content/photo.png`
- Landing page and the first challenge: `site/index.html`

After changing flags, visitors' saved progress resets at the changed level.

## Publishing

`dist/` is committed and `.github/workflows/pages.yml` deploys it to GitHub Pages on
every push to `main`. So after any change:

```sh
npm test                      # rebuilds dist/ and checks it
git add -A && git commit -m "..." && git push
```

`content/` is git-ignored and must never be committed.
