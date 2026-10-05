# Tiles V0.9 — Mobile Reliability / Audio / Session Intelligence

Tiles is a realtime multiplayer pixel-arcade survival game by **Apogee Lab**. Players move across a 19-cell hex arena, one selected player chooses a tile color to eliminate, and the last character standing wins.

V0.9 is a reliability-focused release built on the V0.8 competition-polish baseline. It hardens iPhone/Safari/PWA layout behavior, replaces the background-music implementation with a foreground-only Web Audio controller, adds user volume sliders, removes completely inactive humans after a finished match, refreshes the favicon/PWA icon package, and makes bots more purposeful while still favoring living humans over bot targets.

## Stack

- React 19 + TypeScript + Vite
- HTML Canvas arena renderer
- Cloudflare Worker
- one `GameRoom` Durable Object per room
- one global `Matchmaker` Durable Object
- WebSockets with server-authoritative game state
- no D1 required for active matches

## Match loop

`board flip → pre-round cue → 7.0 s movement → selector wheel → 5.0 s color choice → 1.65 s reveal/reaction → tile break/drop → results`

Powerups remain **Invisibility / Override / Phase Shift**. Click/tap activates a legal held powerup; desktop players may also press **Space**.

## V0.9 highlights

### Foreground-only audio manager

Music and sound effects are now owned by one persistent Web Audio manager with separate music and SFX buses. Tiles intentionally produces no audio while the document is hidden, the phone is locked, Safari/PWA is backgrounded, or the page is being hidden.

- `visibilitychange` and `pagehide` stop active music/SFX immediately and suspend the audio context.
- Returning to the foreground restores only the soundtrack appropriate to the current game state.
- Missed selector ticks, shuffle clicks, break cues, and podium cues are timestamp-guarded so stale sounds do not fire on resume.
- Normal → Final Two music transition starts the destination source before retiring the working source, preventing a failed transition from intentionally creating silence.
- A lightweight watchdog/recovery path restores the desired soundtrack after browser/iOS audio interruptions.
- No Media Session metadata or deliberate OS-level background playback is registered.

### Retuned audio mix + user volume controls

The tuned music ceiling is approximately **35% quieter than V0.8** while the selector-wheel tick is **25% stronger**. Settings now expose pixel-art **Music Volume** and **Sound Effects** sliders from 0–100 in 5% steps. Both display 100 by default; those values multiply the tuned internal mix rather than exposing raw file gain. Preferences persist locally.

### Mobile layout rebuild

The runtime viewport controller now distinguishes actual mobile environments rather than squeezing a desktop composition into a phone viewport:

- mobile portrait PWA
- mobile portrait browser
- mobile landscape PWA
- mobile landscape browser
- compact landscape variants
- desktop

It uses `visualViewport`, orientation, standalone detection, dynamic safe areas and measured usable width/height. Mobile gameplay reserves a protected READY / LEAVE action row and sacrifices decoration/arena size before essential controls. Portrait uses a compact horizontal roster; landscape uses `Power-Up | Arena | Players`.

The supplied V0.9 mobile screenshots are retained under `art-reference/mobile-v0.9/` as regression references.

### Match-scoped inactivity cleanup

Every real human begins a match with no activity credit. A meaningful in-game action grants credit for that match:

- move/destination input during movement;
- manual color choice when that human is selector;
- legal held-powerup activation during an allowed phase.

READY, settings interaction, background mouse/touch movement, timeout automation and spectating do not count. Bots are exempt. A human who performs zero meaningful game inputs is never interrupted mid-match; after the podium they are removed from the room, their reconnect identity is invalidated, and their client returns to the homepage with `REMOVED FOR INACTIVITY`.

### Global bot elimination governor

The original V0.8 bots-only endgame governor remains unchanged once no humans are alive. V0.9 adds a separate human-present governor so bots also help matches progress while humans are alive.

When a forced-progress bot color would hit any living human, the server accepts that human-threatening candidate only **1/3 of the time** and rejects/rerolls it **2/3 of the time**. Bot-only target colors are therefore preferred, but humans are never immune. The process is bounded and hidden; the bot retains its normal visible 0.75–2.5 s selector delay.

### Current favicon everywhere

`index.html`, the manifest, Apple touch icon and PWA/browser favicon set now reference the approved current Tiles icon through cache-busted V0.9 filenames. Legacy icon filenames are also overwritten with the same artwork for fallback safety.

## V0.8 systems preserved

- full pixel-art visible UI and `Tiles Pixel` font
- server-authoritative movement
- moving players may cross; only the final destination is occupancy-blocked
- private red flash + blocked sound when a human arrives at an occupied final target
- same final-destination occupancy rule for bots
- abandoned zero-human public rooms are not reused by Quick Play
- 250 bot username pool with 85 human-style names
- Final Two one-shot banner/swoosh and persistent atmosphere
- pitch-preserved ~15 BPM faster Final Two soundtrack
- podium fanfare, latest-winner crown and persistent room trophy counts
- podium → ordinary lobby → READY again; no rematch modal

## Build / deploy

```bash
npm install
npm run typecheck
npm run build
npx wrangler deploy
```

Cloudflare should provide the existing Durable Object bindings for `GAME_ROOMS` and `MATCHMAKER`.

## Validation note

This build was source/type validated in the artifact environment with temporary local declaration stubs because registry-backed dependency installation was unavailable there. Those validation-only files are removed from the release package. A normal networked GitHub/Cloudflare build remains the final production Vite/Workers verification.
