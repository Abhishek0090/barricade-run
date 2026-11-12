# Barricade Arcade

By **Abhishek Pal**.

Five browser games in real 3D. Three are street games set in the protest against the NEET
paper leak, election "vote chori" / dhandli and corruption: the sidewalks are full of marchers with
placards, banners and tricolours (slogans in English, Hinglish and Hindi), and the police chase you.
Slam Night is WWE-style championship wrestling and Mumbai Local is a train driving sim. Plays on laptop
and mobile, and installs as a PWA that works offline. No real politicians, parties or wrestlers are named.

| Game | Route | What you do |
| --- | --- | --- |
| Barricade Run | `/run/` | Dusk city street. 3-lane runner: jump barricades, slide under the police line, dodge riot police and the detention bus. |
| Barricade Drive | `/drive/` | Night highway with guardrails, sign gantries and neon billboards. Drive a kaali-peeli taxi through the chakka jam on 4 lanes. Nitro smashes barricades, brake buys time. |
| Rail Roko | `/rail/` | Daytime countryside with fields, trees and small stations. Rail Rush-style trolley ride on a curving line. The trolley never leaves the rails: switch tracks around barricades, stopped coaches and oncoming locos and before a track ends, ring the bell to clear railway police, duck the police line. |
| Slam Night | `/dangal/` | WWE-style championship wrestling in a packed arena. Pick Thunder Singh, Rani Blaze or Kid Cyclone, then punch, kick, slam and pin your way up a 5-match ladder (Brick Bouncer, Iron Danda, Venom Vikram, Dr. Destructo) to the champion King Kursi, who brings a steel chair. Combos, finishers in slow motion, 1-2-3 pins and button-mashing kick-outs. All wrestlers are fictional. |
| Mumbai Local | `/local/` | Motorman sim on the Central line. Drive a 12-car local (white and magenta rake, yellow cab) from Kalyan to CSMT on a fast (7 halts) or slow (all 25) duty, then back. Space to start and to depart after the guard's bell, power and brake notches, 4-aspect signals, speed boards, a stop on the 12-car marker at every halt, the guard's bell, a timetable, passengers hanging from the doors, and station announcements read in Marathi, Hindi and English. Six cameras (cab with 360° look, chase, side, drone, front, trackside) and zoom (wheel, + / -, pinch). |

The hub at `/` shows a live preview of each game.

Stack: Next.js 16 (App Router, static export), React 19, TypeScript, Three.js 0.181 (WebGL) for the 3D
scenes, and HTML canvas for the HUD and the 2D fallback. No model, image or audio files: every 3D scene is
built from shapes and textures painted at runtime, and the sounds are synthesised with Web Audio.

## 3D

Each game has a `scene3d.ts` that draws the engine state with Three.js, loaded on demand so Three.js is only
downloaded by pages that use it. The 2D renderers stay as a fallback for devices without WebGL, or if the GPU
drops the 3D context.

| Path | Purpose |
| --- | --- |
| `src/games/shared/rig3d.ts` | Jointed 3D people (wrestlers, runner, police), materials, runtime textures |
| `src/games/shared/world3d.ts` | Road/rail base: renderer, sky, lights, scrolling ground, instanced crowd, police props, pickups |
| `src/games/*/scene3d.ts` | Each game's 3D scene and camera |

## Performance

- Render resolution is capped (1.5× on desktop, 1.25× on phones) and steps down automatically when frames run slow; hub thumbnails render at 1×, at 30 fps, only while on screen.
- Hard-edged 1024 px shadow maps (512 px on phones) instead of soft 2048 px ones.
- Crowds, track pieces, sleepers and city blocks are GPU-instanced; Mumbai Local merges each train and station into a few draw calls.
- Scenery is pooled and reused rather than created as you move.

## Run it

```bash
npm install
npm run dev        # http://localhost:3000
npm run build      # static site in ./out
npm start          # serve ./out (service worker and install work here)
```

If `npm run dev` shows empty thumbnails and Play does nothing, check the browser console for
`SyntaxError: Unexpected end of input`. That means the Console Ninja VS Code extension has patched
`node_modules/next`. Disable the extension for this workspace, run `npm install next --force`, delete
`.next` and start the dev server again.

## Controls

| Action | Laptop / PC | Phone / tablet |
| --- | --- | --- |
| Change lane / track | Left/Right arrows or A/D | Swipe left / right |
| Jump (Run) / nitro (Drive) / ring the bell (Rail) | Up arrow, W or Space | Swipe up |
| Slide or duck (Run, Rail) / brake (Drive) | Down arrow or S | Swipe down |
| Pause | P or Esc | Pause button |
| Wrestle (Slam Night) | Move WASD / arrows; J punch, K kick, L grapple / pin / chair, I finisher | Drag to move; PUNCH, KICK, GRAB, FINISH buttons |
| Move the open map / re-centre on you | Drag with the mouse / C | Drag with one finger / ◎ button |

There are no on-screen arrow buttons: swipe anywhere on the screen. The first run on a touch screen
shows a short gesture hint.

## Rules shared by all games

- Clipping the side of an obstacle makes you stumble and the police close in. Stumble again within
  6 seconds and you are caught.
- Every run starts with 1 free lifeline. When you crash you get 6 seconds to use it: the road ahead is
  cleared and you get 2.5 seconds of protection. Heart pickups add lifelines (up to 3).
- Score is distance in metres plus 10 per coin (Drive: plus 25 per smashed barricade). Each game keeps
  its own best score on the device.

## Code map

| Path | Purpose |
| --- | --- |
| `src/app/page.tsx`, `src/components/hub.tsx` | Hub with live game previews |
| `src/app/{run,drive,rail}/page.tsx` | One route per game |
| `src/components/game-shell.tsx` | Shared screens, HUD, loop, keyboard and swipe input for any game |
| `src/games/registry.ts` | List of games shown on the hub |
| `src/games/shared/types.ts` | `ArcadeGame` (engine contract) and `GameDef` (game description) |
| `src/games/shared/scene.ts` | Pseudo-3D projection, primitives, buildings, people, the player character, coins |
| `src/games/shared/crowd.ts` | Protesters, banners and flying exam papers |
| `src/games/shared/props.ts` | Barricade, police line, riot police, detention bus |
| `src/games/shared/audio.ts` | Web Audio sound effects and siren |
| `src/games/runner/` | Barricade Run: constants, engine, render, def |
| `src/games/drive/` | Barricade Drive: constants, engine, render, def |
| `src/games/rail/` | Rail Roko: constants, engine, render, def |
| `src/games/dangal/` | Slam Night: engine (moves, grapples, pins, AI, ladder), render (arena, ring, animated wrestlers, HUD, character select), def |
| `src/components/pwa.tsx`, `src/app/manifest.ts`, `public/sw.js` | Service worker, install prompt, offline cache |
| `scripts/generate-icons.mjs` | Draws the app icons (`npm run icons`) |
| `scripts/make-share.mjs` | Builds the copy-paste setup and sync scripts (`npm run share`) |

To add a game: write an engine that implements `ArcadeGame`, a renderer, and a `GameDef`, add a
`play.tsx` and a route page, and list the def in `src/games/registry.ts`.

## Share with another laptop

```bash
npm run share
```

This writes `barricade-run-share/setup-barricade-run.mjs` (new laptop), `sync-barricade-run.mjs`
(update an existing copy, including the old single-game version) and `HOW-TO-SETUP.md`. The folder is
ignored by git.
