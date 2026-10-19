# Barricade Run

Endless 3-lane runner in the style of Subway Surfers. You run down a road lined with protesters and
dodge police barricades, police lines, officers with riot shields and detention buses, while the
police chase you. Plays on laptop and mobile and installs as a PWA that works offline.

Stack: Next.js 16 (App Router, static export), React 19, TypeScript, HTML canvas. No game engine and
no image or audio files: the scene is drawn with canvas shapes and the sounds are synthesised with Web Audio.

## Run it

```bash
npm install
npm run dev        # http://localhost:3000
npm run build      # static site in ./out
npm start          # serve ./out (service worker and install work here)
```

## How to play

| Action | Laptop / PC | Mobile |
| --- | --- | --- |
| Change lane | Left/Right arrows or A/D | Left/Right buttons or swipe |
| Jump (clear barricades) | Up arrow, W or Space | Jump button or swipe up |
| Crouch / slide (under the police line) | Down arrow or S | Crouch button or swipe down |
| Pause | P or Esc | Pause button |

- Officers and detention buses can only be avoided by changing lane. Some buses drive towards you.
- Clipping the side of an obstacle makes you stumble and the police close in. Stumble again
  within 6 seconds and you are caught.
- Every run starts with 1 free lifeline. When you crash you get 6 seconds to use it: the road ahead
  is cleared and you get 2.5 seconds of protection. Heart pickups add lifelines (up to 3).
- Score is distance in metres plus 10 per coin. The best score is stored on the device.

## Code map

| Path | Purpose |
| --- | --- |
| `src/game/engine.ts` | Rules: movement, spawning, collisions, chase, lifelines |
| `src/game/render.ts` | Pseudo-3D canvas renderer |
| `src/game/audio.ts` | Web Audio sound effects and siren |
| `src/game/constants.ts` | Tuning values (speeds, sizes, timings) |
| `src/components/barricade-run.tsx` | Screens, HUD, keyboard, touch and swipe input |
| `src/components/pwa.tsx` | Service worker registration and install prompt |
| `src/app/manifest.ts`, `public/sw.js` | PWA manifest and offline cache |
| `scripts/generate-icons.mjs` | Draws the app icons (`npm run icons`) |
| `scripts/make-share.mjs` | Builds the copy-paste setup script (`npm run share`) |

## Share with another laptop

```bash
npm run share
```

This writes `barricade-run-share/setup-barricade-run.mjs` (new laptop), `sync-barricade-run.mjs`
(update an existing copy) and `HOW-TO-SETUP.md`. The folder is
ignored by git.
