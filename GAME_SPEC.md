# Tiles V0.2 Game Specification

This file captures the agreed design decisions before the first playable prototype.

## Session
- 2–5 players; 5 is the intended full game.
- Private room-code play only in V0.1.
- No accounts or installs required.
- Session wins persist for the life of the room and are shown as trophy counts.
- One life per match. Eliminated players spectate until the match ends.

## Arena
- Hexagonal arena made from 19 hex cells (hex side length 3).
- Six colors: red, orange, yellow, green, blue, violet.
- Color layout reshuffles every round.
- Color counts are intentionally uneven but every color is guaranteed to appear between 2 and 5 times in the current prototype.
- Solid outer boundary: players do not fall off the arena edge.
- Players cannot share a tile.

## Movement
- Tap/click any reachable tile; avatar automatically pathfinds there.
- Base movement is intentionally quick.
- A new destination can be chosen during normal movement.
- During a committed collision/recovery animation, movement input is ignored.

## Collisions
- Players are solid.
- Glancing/conflicting collisions cause a short ~220 ms bounce/recovery penalty, then routes are recalculated.
- Direct head-on route swaps trigger a longer ~900 ms penalty before routes are recalculated around one another.
- Final art should animate a bump, recoil/stumble, curved sidestep past one another, then route continuation.
- V0.2 uses placeholder circle motion/wobble for collision visuals; final sprite animation will show momentum deflection and the curved head-on bypass.

## Round loop
1. Board reshuffles.
2. 0–2 power-ups spawn.
3. 7-second movement phase.
4. Movement locks.
5. Selector wheel phase (~3 sec).
6. Chosen player gets ~4 sec to select a color.
7. Selected color is revealed/flickers.
8. 1.15-second reaction window.
9. Selected-color tiles drop; players on them are eliminated unless saved by Phase Shift.
10. Elimination result displays.
11. If 2+ players remain, next round begins. If 1 remains, that player earns a session trophy.

## Selector fairness
Selection is random with a fairness ceiling:
- A player may receive a second selector turn before everyone has received a first.
- At most two distinct players may reach their second selection while another living player remains at zero selections.
- Once two players have reached two selections, only zero-selection players remain eligible until everyone has had at least one turn.
- Once everyone has at least one selection, the fairness cycle resets.
- Eliminated/disconnected players are skipped.

## Power-ups
- 0 power-ups: ~35% of rounds.
- 1 power-up: ~45%.
- 2 power-ups: ~20%.
- Maximum one held power-up per player.
- Power-ups are physical board objects and are collected by the character that actually reaches the tile first.

V0.2 implements:
- **Speed** (common): temporary faster movement.
- **Phase Shift** (very rare): after the doomed color is revealed, a player standing on that color has the 1.15-second reveal window to activate it. The server teleports them to a random safe, unoccupied tile.

Planned later:
- Repulsor / bump power.
- Shield.
- Swap or other rare abilities after playtesting.

## UI
- Desktop/landscape: power controls left, arena center, players/status right.
- Portrait remains playable; a non-blocking message recommends landscape.
- Built-in two-page tutorial; playable tutorial is not required.
- Optional iOS Add to Home Screen instructions behind a "show me" action.
- Apogee Lab attribution/link.
- Final public domain target: `tiles.apogeelab.org`.

## Art direction
- V0.2 players are black circles.
- Final version: pixel-art sprites and animations.
- Planned animation states include idle, run, bump, stumble, fall, elimination, and victory.
