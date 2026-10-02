# Tiles — Apogee Lab

A realtime 2–5 player browser party game prototype built for the Handshake AI Skills Studio multiplayer-game challenge.

This repository is the **V0.2 GitHub-ready playtest build**. The point of this version is to validate the multiplayer loop, timing, mobile controls, room system, and 19-hex arena before spending time on final pixel-art sprites and effects.

## What is already implemented

- private 4-character room codes
- 2–5 player lobby with Ready + host Start flow
- one Cloudflare Durable Object per logical room
- 19-cell hex arena (side length 3)
- six tile colors: red, orange, yellow, green, blue, violet
- intentionally uneven 2–5 tiles per color, fully reshuffled every round
- tap/click-anywhere pathfinding; no joystick required
- fast server-authoritative movement
- solid players and collision commitment/recovery logic
- separate glancing and head-on collision penalties
- 7-second movement phase
- fair-random selector logic with the agreed two-repeat ceiling
- 4-second selector choice phase
- 1.15-second doomed-color reaction window
- one-life elimination and spectator state
- room-session trophy/win counter
- 0–2 physical power-ups per round
- Speed and rare Phase Shift power-ups
- refresh/reconnect support with a 45-second reserved-seat grace period
- host transfer if the host disconnects
- temporary rooms that are cleared after the last reserved seat expires
- responsive desktop, landscape-phone, and portrait-phone layouts
- two-page built-in tutorial
- optional iPhone Add to Home Screen tip
- PWA manifest + installable icons
- custom Tiles favicon: light background, outer hex, six colored inner hexes
- Apogee Lab attribution/link
- GitHub Actions build/typecheck workflow

The player art is intentionally still black circles. The finished game can replace those with pixel-art sprite sheets without changing the networking model.

## Architecture

```text
Phone / laptop browsers
        │
        │ HTTPS + WebSocket
        ▼
tiles.apogeelab.org
        │
        ▼
Cloudflare Worker
  ├─ React/Vite static app
  ├─ POST /api/rooms
  ├─ GET  /api/rooms/:code
  └─ WS   /api/rooms/:code/ws
                 │
                 ▼
       GameRoom Durable Object
       (one per room code)
          ├─ players / wins
          ├─ board / rounds
          ├─ movement / paths
          ├─ collisions
          ├─ power-ups
          ├─ selector fairness
          └─ authoritative timers
```

### Stack

- **Frontend:** React + TypeScript + Vite
- **Game rendering:** HTML Canvas
- **Backend:** Cloudflare Worker
- **Realtime room server:** Cloudflare Durable Objects + WebSockets
- **Persistence:** each Durable Object's SQLite-backed storage
- **Database:** no D1 required for this prototype
- **Deployment:** Cloudflare Vite plugin + Workers Static Assets

D1 can be added later for persistent analytics, global rankings, or long-term game history. It is deliberately not in the realtime gameplay path.

## Repository structure

```text
.github/workflows/ci.yml      GitHub typecheck/build verification
src/
  client/
    App.tsx                   lobby, tutorial, HUD, overlays
    styles.css                responsive/mobile styling
    game/
      GameCanvas.tsx          arena, players, power-ups, reveal rendering
      hex.ts                  hex geometry + hit testing
    network/
      socket.ts               WebSocket + reconnect client
  server/
    worker.ts                 room API + Durable Object routing
    GameRoom.ts               authoritative multiplayer game server
  shared/
    constants.ts              gameplay/timing tuning values
    messages.ts               validated client message parser
    types.ts                  shared client/server state types
public/
  icons/                      favicon + PWA icons
  manifest.webmanifest
GAME_SPEC.md                  agreed design rules
wrangler.jsonc                Cloudflare config / Durable Object declaration
vite.config.ts                React + Cloudflare Vite integration
```

## Run it locally

### Requirements

- **Node.js 22** (`.nvmrc` is included)
- npm

Install dependencies:

```bash
npm install
```

Run the full React + Cloudflare Worker/Durable Object development environment:

```bash
npm run dev
```

The Cloudflare Vite plugin runs the Worker inside the Workers runtime while Vite serves the frontend with hot reload.

### Verify before pushing

```bash
npm run check
```

That runs both TypeScript typechecks and the production Vite build.

You can also run them separately:

```bash
npm run typecheck
npm run build
```

### Multiplayer local test

1. Open the localhost URL.
2. Create a room.
3. Join the code from a second device/browser.
4. Ready the non-host player and start.

Reconnect identity is stored in **sessionStorage**, not localStorage, so separate browser tabs can act as separate players while a refresh in the same tab can reclaim its existing seat.

## Deploy to Cloudflare

Authenticate once if needed:

```bash
npx wrangler login
```

Deploy:

```bash
npm run deploy
```

The included `wrangler.jsonc` declares:

- the `GAME_ROOMS` Durable Object binding
- `GameRoom` as a new SQLite-backed Durable Object export
- SPA fallback handling
- Worker-first routing for `/api/*`

For a new Cloudflare Worker, Wrangler will provision the Durable Object namespace on the first deployment.

After the `*.workers.dev` deployment works, add the custom domain:

```text
tiles.apogeelab.org
```

Then test with at least two real devices. A Wi-Fi + cellular test is useful for confirming the public WebSocket path.

## Push to GitHub

If the repo is new:

```bash
git init
git add .
git commit -m "Tiles V0.2 multiplayer prototype"
git branch -M main
git remote add origin <YOUR_GITHUB_REPO_URL>
git push -u origin main
```

The included GitHub Actions workflow runs `npm install` and `npm run check` on pushes and pull requests, so GitHub gives you an independent build check.

If you connect the repo to Cloudflare Workers Builds, use the normal Node 22 environment and your Cloudflare deployment flow. You can also keep deployment manual with `npm run deploy` while the project is still changing quickly.

## First values to tune during playtesting

Edit `src/shared/constants.ts`:

```text
MOVEMENT_PHASE_MS      7000 ms
BASE_STEP_MS            180 ms
SPEED_STEP_MS           115 ms
GLANCING_COLLISION_MS   220 ms
HEAD_ON_COLLISION_MS    900 ms
COLLISION_COMMIT_MS     300 ms
SELECTOR_WHEEL_MS      3000 ms
SELECTOR_CHOICE_MS     4000 ms
REVEAL_WINDOW_MS       1150 ms
RECONNECT_GRACE_MS    45000 ms
```

## Intentional prototype limitations

These are not forgotten features; they are deliberately deferred until the core game is playtested:

- players are black circles rather than final pixel-art sprites
- collision *logic* exists, but the canvas currently uses a placeholder shake instead of the final momentum deflection / stumble / curved sidestep sprite animation
- the selector phase currently shows a simple choosing overlay rather than the final spinning player wheel
- tile dropping is represented by flicker + dark holes rather than finished fall/depth animation
- only Speed and Phase Shift are implemented
- no sound or haptics yet
- no QR-code room join yet
- no D1 analytics/global leaderboard yet
- active timed phases reset safely to the lobby if the Durable Object process is unexpectedly reconstructed; true timer recovery can be added after gameplay is stable

## First playtest checklist

See [`TESTING.md`](./TESTING.md) for the short multiplayer test pass to run before changing visuals.
