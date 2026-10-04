# Tiles V0.6 — Fluid Movement + Adaptive Arcade UI

Tiles is a realtime multiplayer browser party game by Apogee Lab. V0.6 keeps the public matchmaking/bot systems from V0.5.3, replaces normal player collision physics with deterministic tile-occupancy movement, and introduces a deliberate three-environment UI system that fits itself to the usable browser/PWA viewport.

## Architecture

- React 19 + TypeScript + Vite client
- HTML Canvas arena renderer
- Cloudflare Worker
- `GameRoom` Durable Object per room
- global `Matchmaker` Durable Object for public-room discovery
- WebSockets with server-authoritative room/game state
- no D1 required for active gameplay

## V0.6 highlights

### Fluid movement / occupancy

Normal moving players no longer generate collision events. Characters may visually slide around each other while travelling. A player may select an already occupied destination; the server only resolves occupancy when the movement step reaches that tile.

- direct swaps are allowed when both players vacate simultaneously
- same-target arrivals are deterministic: earliest authoritative arrival wins, then stable player id tie-break
- an occupied final destination blocks entry without knockback/recoil
- an occupied intermediate route cell triggers a reroute around that cell
- the selected destination receives a local-only glowing hex outline

### Bubble

Bubble remains the deliberate exception to normal occupancy. If a Bubble-active player reaches a tile still occupied by a non-Bubble player, the server tries to displace the occupant to the best valid adjacent tile and lets the Bubble player claim the target. Bubble-vs-Bubble cannot displace either player.

### Three explicit UI environments

A client-side viewport controller chooses one layout:

1. Desktop
2. Mobile landscape
3. Mobile portrait

It also measures `window.visualViewport` and detects standalone/Home Screen mode. CSS variables (`--viewport-width`, `--viewport-height`, `--ui-scale`) let each layout fit the actual usable screen instead of assuming Safari and an installed PWA expose the same height.

### Arcade presentation

- permanent sparse tile-color shooting-star particles behind the interface
- glowing/sparking floating tiles on desktop and mobile-landscape landing screens
- static pixel-confetti treatment around every Tiles logo
- real Apogee Lab logo next to the homepage brand link
- redesigned two-page tutorial with character cues and expandable Add to Home Screen instructions

## Public matchmaking retained from V0.5

- Quick Play
- public/private group creation
- optional private bot fill
- staged public bot joins
- human-over-bot replacement before roster lock
- committed eight-second start countdown
- exactly five characters for public / bot-enabled matches
- server-private bot identity
- selector fairness and V0.5.3 visual wheel synchronization

## Cloudflare build settings

- Build command: `npm run build`
- Deploy command: `npx wrangler deploy`

Bindings:

- `GAME_ROOMS (GameRoom)`
- `MATCHMAKER (Matchmaker)`

## Local commands

```bash
npm install
npm run check
npm run dev
```

## Runtime assets

Production assets live in `public/`.

- Tiles logo: `public/assets/tiles-logo.png`
- Apogee Lab mark: `public/assets/apogee-lab-logo.png`
- character sheets: `public/assets/characters/`
- tile atlas: `public/assets/tiles/hex-atlas.png`
- powerups: `public/assets/powerups.png`
- music: `public/audio/retro-arcade-theme.mp3`

Reference art and the mobile/browser screenshots used for the V0.6 layout rewrite are retained in `art-reference/`.
