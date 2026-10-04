# Tiles V0.5 test checklist

## Build / deploy

1. Run `npm install`.
2. Run `npm run check`.
3. Deploy with `npx wrangler deploy`.
4. Confirm Cloudflare reports both bindings: `GAME_ROOMS (GameRoom)` and `MATCHMAKER (Matchmaker)`.
5. Smoke-test the workers.dev URL before changing the production custom domain.

## Quick Play / matchmaking

1. Open a clean browser/device and press Quick Play.
2. Confirm the room begins with the human player only.
3. Confirm the first additional visible player appears roughly 4.6 seconds later.
4. Confirm subsequent additions are staggered rather than simultaneous.
5. Confirm the final roster reaches 5/5.
6. Confirm the final countdown runs for eight seconds.
7. Repeat with a second real device joining during bot fill and confirm it replaces a bot without increasing the visible count.
8. Join during the eight-second countdown and confirm the countdown does not reset.
9. Leave during the eight-second countdown and confirm the countdown does not reset.
10. At zero, confirm the gameplay roster has exactly five characters.

## Private modes

- Private / Bots OFF: one human cannot start; 2–5 humans can start using the human readiness threshold.
- Private / Bots ON: one human can ready, bots fill the lobby, and the match starts with five characters.
- Public created group: discoverable to Quick Play and bot-enabled.

## Ready voting

Verify required human ready votes: 1/1, 2/2, 2/3, 3/4, 3/5. Bots must never change the requirement.

## Collision regression

1. Intentionally send two players head-on repeatedly.
2. Confirm a collision produces one coherent impact/recovery event instead of repeated bouncing.
3. Confirm both players end on distinct tiles.
4. Confirm they resume their original destinations after recovery when a route remains available.
5. Create repeated same-target collisions and verify deterministic priority/yield behavior.
6. Confirm a third player does not enter a tile reserved for another pair's collision recovery.
7. Rapidly tap new destinations near impact and confirm collision commitment cannot create an infinite loop.

## Bubble

1. Collect Bubble and activate during movement.
2. Confirm the visible bubble persists for about four seconds with no numeric timer.
3. Hit a non-Bubble player and confirm they are displaced one valid neighboring tile when possible.
4. Confirm the victim cannot be knocked outside the arena.
5. Confirm Bubble-vs-Bubble uses normal collision behavior.
6. Confirm a knocked player can collect an item on the landing tile when their inventory is empty.

## Bot behavior

- Bots move through 2–6 destinations rather than staying still.
- Bots collide and collect power-ups through normal rules.
- Bot selector waits visibly before choosing.
- Bot selector never intentionally chooses the color directly under itself.
- Phase Shift is used when a bot is threatened and holds it.
- No UI displays a BOT label, icon, counter, or per-player bot disclosure.
- Visible names do not duplicate bot names within the room.

## Mobile landscape regression

On a notched/Dynamic-Island iPhone in landscape:

- No page scrolling is necessary.
- Power-up panel is left, arena center, players right.
- No content is under the Dynamic Island/notch.
- READY and LEAVE ROOM are simultaneously visible in the lobby.
- Landing menu fits inside the viewport.
- Floating tile/character decorations remain visible around the landing panel.

## Mobile portrait regression

- No landscape-recommendation banner appears.
- The top hardware-safe area remains empty enough that the camera island/notch covers nothing important.
- Landing panel is centered.
- Lobby player state, arena, compact power-up panel, READY, and LEAVE ROOM are all reachable without page scrolling.

## UI / art

- Permanent PNG Tiles logo is used rather than CSS letter rendering.
- Room-code badge has gold framing; tapping it copies only the four-character code and shows `COPIED TO CLIPBOARD` for about one second.
- No Copy Invite Link button remains.
- Player cards use the actual player color for the card frame and larger portrait sprite.
- Major panels use the new gold ornamental arcade frame language.
- Landing footer no longer shows `2–5 PLAYERS · NO ACCOUNTS · ROOM CODE MULTIPLAYER`.
- Background particles/stars remain sparse and do not interfere with gameplay.

## Audio

- Trimmed music loops without the former trailing silent gap.
- Music begins after user interaction when autoplay restrictions apply.
- Mute preference persists locally.
