# Tiles V0.7 — Sensory Arcade Update

Tiles is a realtime multiplayer browser party game by Apogee Lab. V0.7 focuses on the part of the project that makes a simple rule set feel like a finished game: readable timing, strategic powerups, satisfying between-round rhythm, stronger endgame presentation, and a faster rematch loop.

## Stack

- React 19 + TypeScript + Vite
- HTML Canvas arena renderer
- Cloudflare Worker
- one `GameRoom` Durable Object per room
- one global `Matchmaker` Durable Object
- WebSockets and server-authoritative game state
- no D1 required for live matches

## V0.7 highlights

### Strategic powerups

The powerup set is now **Invisibility / Override / Phase Shift**.

- **Invisibility** hides the player's arena position from every other client for the rest of the round. The owner still sees a translucent/glitching self representation.
- **Override** guarantees its owner is the next selector. At most one Override can exist across the board, inventories, or pending selector state at any time.
- **Phase Shift** remains the emergency doomed-tile escape and now has a 1.65-second reaction window plus source/destination lightning effects.
- Click/tap activates a legal held powerup; desktop players may also press **Space**.

### Round cadence

A round now has explicit punctuation:

`shuffle → pre-round countdown → 7.0 s movement → selector wheel → 5.0 s color choice → 1.65 s reveal → results`

- movement and color-choice timers use a custom sprite-digit atlas and show tenths of a second
- the pre-round sequence uses three short countdown tones followed by a brighter GO tone
- supported devices receive matching light haptic cues
- the board performs a left-to-right flip wave between rounds, with a tiny landing bounce and a damped mechanical click on each tile

### Selector / elimination polish

- selector wheel uses a longer final deceleration without turning the phase into dead time
- wedge crossings receive light ticks and the final landing receives a stronger clunk
- the selected player's card pulses at the actual landing moment
- Override's electric-blue wheel treatment appears only to the player who used Override
- doomed characters use a panic/fall pose and descend with the tile instead of disappearing abruptly

### Final Two and victory loop

- at two survivors, `FINAL TWO` flashes during the existing pre-round countdown
- background particles intensify slightly and the arena frame receives a stronger glow
- the match ends in a full-screen pixel-art podium scene with a ~300 ms transition, about three seconds of presentation, trophy counts on podium bases, and a winner dance
- the most recent winner receives the small gold crown beside their gamer tag; it remains through the next match until another player wins
- the post-match action is a clear **REMATCH?** prompt while the room and session trophy totals remain intact

### Smarter bot-only endgames

When no real human remains alive, a hidden pacing governor prevents endless bot stalemates without secretly moving bots.

- a grace interval of 1–3 natural rounds is rolled after entering bot-only play and after every bot elimination
- two grace intervals of 3 can never occur consecutively
- once the grace interval expires, bot selectors prefer a color occupied by exactly one opponent, otherwise the least-populated opponent color
- bots never intentionally select their own current tile color
- if no legal opponent target exists, the bot makes a normal safe choice and the forced-progress requirement carries forward
- normal 0.75–2.5 second bot decision delay is preserved

### Home-screen settings

The old persistent sound button is replaced by a small home-screen settings control for:

- Music
- Sound Effects
- Haptics (only where the browser exposes vibration support)

Preferences are stored locally.

## Preserved systems

V0.7 retains the V0.6 occupancy movement model, local destination glow, public Quick Play, private/public groups, staged bot filling, human-over-bot replacement, committed start countdown, selector fairness, responsive desktop/mobile-landscape/mobile-portrait layouts, `visualViewport` fitting, safe-area handling, background particles, ornamental frames, room-code copy behavior, reconnect identities, and session trophy counts.

## Cloudflare build settings

- Build: `npm run build`
- Deploy: `npx wrangler deploy`

Bindings:

- `GAME_ROOMS` → `GameRoom`
- `MATCHMAKER` → `Matchmaker`

## Local commands

```bash
npm install
npm run check
npm run dev
```

The GitHub/Cloudflare production pipeline is the final dependency/build verification. This source package was also checked with strict TypeScript compiler passes using local declaration stubs because package-registry access was unavailable in the build environment that produced the ZIP.
