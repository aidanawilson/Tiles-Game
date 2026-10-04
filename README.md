# Tiles V0.5 — Public Arcade Build

Tiles is a realtime multiplayer browser party game by Apogee Lab. V0.5 turns the prior private-room prototype into a much more complete arcade game: public Quick Play, server-controlled bots, committed matchmaking countdowns, Bubble collisions, deterministic collision recovery, a new logo, and dedicated phone layouts.

## Architecture

- React 19 + TypeScript + Vite client
- HTML Canvas arena renderer
- Cloudflare Worker HTTP/router layer
- One `GameRoom` Durable Object per match room
- One global `Matchmaker` Durable Object for public-room discovery
- WebSockets for authoritative realtime room state
- No D1 required

## Major V0.5 systems

### Quick Play / public rooms

`QUICK PLAY` searches open public rooms and creates one when none are available. Public rooms always use bot filling and always lock a five-character roster before gameplay.

Created groups support:

- Public — discoverable, bot-enabled, five-character matches
- Private + Fill With Bots ON — five-character matches, including solo + four bots
- Private + Fill With Bots OFF — human-only matches with 2–5 players

Bots remain server-internal as a player type; the normal gameplay state does not expose per-player bot labels.

### Lobby timing

- First synthetic player in a bot-enabled lobby: 4.6 seconds after the first human arrives
- Subsequent synthetic joins: random 3.6–4.6 second intervals
- Human arrivals replace an existing bot before consuming a new visible slot
- When the roster/start requirements are met, the eight-second countdown is committed and never cancels
- Humans may continue replacing bots during the committed countdown
- At zero, bot-enabled rooms are force-filled to exactly five characters and roster-locked

### Collision rewrite

Collision outcomes are now created server-side as deterministic collision events. Each event carries its start/end timestamps, partner, role, and preselected recovery tile. Recovery tiles are treated as temporary reservations while the event runs. The same player pair receives a short post-collision cooldown to prevent immediate collision loops.

The Canvas client animates the authoritative event with multiple impact/recoil/recovery stages instead of procedural shake-only feedback.

### Bubble power-up

Bubble lasts four seconds on the server with no HUD countdown. The active character receives a translucent energy bubble. Contact with a non-Bubble player knocks the victim one valid adjacent tile in the impact direction (or applies recoil if no adjacent tile is available). Bubble-vs-Bubble uses normal collision behavior.

## Cloudflare build settings

- Build command: `npm run build`
- Deploy command: `npx wrangler deploy`

V0.5 adds a second Durable Object binding:

- `GAME_ROOMS (GameRoom)`
- `MATCHMAKER (Matchmaker)`

Both are declared with SQLite storage in `wrangler.jsonc` using Cloudflare's declarative `exports` configuration.

## Local commands

```bash
npm install
npm run check
npm run dev
```

## Runtime assets

Production assets live in `public/`. The permanent title logo is:

`public/assets/tiles-logo.png`

Design and regression screenshots are retained in `art-reference/`, including the mobile layout screenshots used for the V0.5 responsive rewrite.

## Music

Runtime music:

`public/audio/retro-arcade-theme.mp3`

License evidence:

`licenses/retro-arcade-theme-license.png`
