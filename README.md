# Tiles V0.8 — Full Pixel Competition Polish

Tiles is a realtime multiplayer pixel-arcade survival game by **Apogee Lab**. Players move across a 19-cell hex arena, then one player chooses a tile color to eliminate. The last character standing wins.

V0.8 is a competition-polish pass: gameplay feedback is cleaner, abandoned Quick Play rooms cannot trap new players in stale bot matches, the endgame has stronger audiovisual escalation, and the visible interface has been unified around a custom pixel-art language.

## Stack

- React 19 + TypeScript + Vite
- HTML Canvas arena renderer
- Cloudflare Worker
- one `GameRoom` Durable Object per room
- one global `Matchmaker` Durable Object
- WebSockets with server-authoritative game state
- no D1 required for active matches

## Core match loop

`board flip → pre-round cue → 7.0 s movement → selector wheel → 5.0 s color choice → 1.65 s reveal/reaction → tile break/drop → results`

Powerups are **Invisibility / Override / Phase Shift**:

- **Invisibility** hides the user's arena position from other clients for the rest of the round while leaving a translucent self-view.
- **Override** is globally unique and guarantees its owner becomes the next selector.
- **Phase Shift** teleports a threatened player to a safe tile during the reveal window.

Click/tap activates a legal held powerup; desktop players may also press **Space**.

## V0.8 highlights

### Cleaner movement feedback

Moving characters may cross/slide past one another without server collision or recoil. Occupancy matters only at the player's **final selected destination**. If that destination is still occupied on arrival, the server stops the player on the previous valid tile. Humans receive a private red target flash and subtle error sound; bots use the same authoritative rule without client feedback.

### Quick Play always starts from a live human room

A public room with zero connected humans is not eligible for Quick Play. An explicit last-human leave abandons the room immediately; unexpected disconnects retain the reconnect grace period. If no live human public room exists, Quick Play creates a fresh room.

### 250-name bot identity pool

Bots draw from exactly **250 preset names**: 85 human-style names/variants and 165 arcade/gamer names. Visible names remain unique within a room and never receive a BOT label.

### Full pixel presentation

V0.8 ships a local **Tiles Pixel** bitmap-style font and uses it throughout the UI, including dynamic gamer tags, room codes, tutorial copy, buttons, settings, HUD labels, selector text and podium values. Inputs remain semantic browser controls underneath, but their visible treatment is pixel-art styled.

Buttons, cards, panels, toasts, selector components and settings controls use stepped pixel geometry, hard shadows and nearest-neighbor scaling. The selector wheel and pointer also use hard pixel silhouettes rather than smooth round browser UI.

### Final Two escalation

The first transition to exactly two survivors triggers a one-shot framed **FINAL TWO** fly-through banner with a synchronized swoosh. It does not repeat if both players survive the next round.

The Final Two atmosphere then persists until match end:

- higher-density/brighter shooting particles
- hollow-center cross-shaped pixel stars
- stronger arena-frame glow
- a pitch-preserved soundtrack variant running roughly **15 BPM faster**

The normal and Final Two tracks crossfade at approximately the equivalent musical position rather than restarting from the beginning.

### New sound pass

- a soft mechanical click follows each tile in the left-to-right board-flip wave
- one ceramic break cue accompanies the doomed-color fracture/drop
- blocked final destinations receive a private error cue
- Final Two receives a one-shot swoosh
- the podium fanfare begins after the podium has visually appeared

All effects obey the **Sound FX** setting. Music and haptics remain separately configurable on the home screen.

### Podium and lobby flow

The podium still presents the top finishers, trophy totals and newest winner crown, but the winner sprite animation now snaps cleanly between atlas frames instead of sliding through the sheet. Trophy icons/counts have dedicated spacing.

After the podium, the room returns directly to the ordinary lobby. There is no REMATCH modal or special rematch button; every player simply presses **READY** again.

## Official app icon

The PWA/favicon package uses the approved Tiles character + Tiles logo icon in 512, 192, Apple-touch, 64, 32, 16 and ICO variants.

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

The source was validated with strict client/server/node TypeScript passes using temporary local declaration stubs and a CSS parse check. Those validation stubs are not included in the release package. Package-registry access was unavailable in the environment that produced the ZIP, so the GitHub/Cloudflare pipeline remains the final fresh dependency + Vite production-build verification.

## Audio licensing note

The V0.8 SFX source files were supplied by the project owner. This repository intentionally does not invent license terms for those files. See `licenses/V0.8_AUDIO_NOTES.md` and retain/verify the applicable source-page licenses before public distribution or contest submission.
