# Tiles V0.8 — Game Specification

## Match format

- 19-cell hex arena (`BOARD_RADIUS = 2`).
- Up to five characters.
- Quick Play, Public, and Private + Bots ON begin matches with exactly five characters.
- Private + Bots OFF uses the actual 2–5 human roster.
- One life per match; eliminated players spectate.
- Last survivor wins and earns one persistent room/session trophy.
- The most recent winner owns the gold crown until another player wins.

## Round phases

1. **Shuffle** — current tiles flip into their newly randomized colors in a left-to-right wave.
2. **Pre-round** — three short cues and a brighter GO cue provide a planning beat.
3. **Movement** — exactly 7.0 seconds with visible tenths timer.
4. **Selector wheel** — authoritative selector result; wheel visually lands on that exact player.
5. **Selector choice** — exactly 5.0 seconds to choose a doomed color.
6. **Reveal** — 1.65-second reaction window; Phase Shift may be used if threatened.
7. **Drop / results** — selected-color tiles break/fall; doomed characters fall with them.
8. Continue until <=1 character remains alive.

## Movement

- Tap/click a destination tile.
- The server pathfinds toward that tile.
- Moving characters may cross/slide visually past one another. Intermediate route cells do **not** create player collisions, knockback, recoil or path cancellation.
- Final destination occupancy is authoritative.
- The player may target an occupied tile because its occupant might leave before arrival.
- If the final target is empty at arrival, the mover enters it.
- If the final target is still occupied, the mover remains on the previous valid tile and their movement command ends.
- Humans receive a private red double-flash on the target and a blocked-destination SFX. Other clients do not see/hear that cue.
- Bots use the same final-destination rule without human UI feedback.
- Simultaneous final claims are resolved deterministically server-side; one player can own a tile at a time.
- The player's selected destination retains a local-only glow while traveling.

## Powerups

One inventory slot per player.

### Invisibility
- Manually activated during movement.
- Other clients receive no visible board sprite for that player for the rest of the round.
- The owner sees a translucent/glitching self representation.
- Player remains physically present in server occupancy and remains visible in player list.
- Effect ends at the round boundary.

### Override
- Globally unique across board, inventory and pending-selector state.
- Activating it guarantees its owner is the **next selector**.
- The authoritative wheel still spins and lands on that owner.
- Only the owner receives the blue/electric OVERRIDE wheel treatment.
- Consumed after the guaranteed selector event.

### Phase Shift
- Emergency reveal-window powerup.
- If player is on the doomed color, activation teleports them to a random valid safe unoccupied non-doomed tile.
- Yellow source/destination lightning effect communicates the teleport.

Desktop shortcut: **Spacebar** activates a currently legal held powerup, except while typing in an editable control.

## Selector fairness

- Normal selector logic uses the existing modified fairness cycle.
- Eliminated players are excluded.
- Override temporarily supersedes fairness for one selector event.
- Wheel visuals always derive their landing wedge from the server-authoritative selector ID.

## Bots

- Bots use the same movement and tile occupancy rules as humans.
- Each movement phase they choose roughly 2–6 waypoint destinations with natural pauses.
- Bots may collect/use powerups.
- Bot selector delay remains randomized around 0.75–2.5 seconds.

### Bots-only endgame governor

When no real human remains alive and more than one bot survives:

- roll 1–3 grace rounds after entering bots-only play and after every bot elimination;
- a grace value of 3 may never occur twice consecutively;
- if a natural bot death occurs, reset the no-elimination counter and reroll;
- after grace expires, the selected bot attempts a rational elimination:
  1. prefer a color occupied by exactly one opponent;
  2. otherwise choose the least-populated opponent color;
  3. never intentionally choose its own current color;
  4. if no safe opponent target exists, make a normal safe choice and carry the forced-progress requirement forward.
- Never secretly reposition bots to manufacture a death.

## Public matchmaking / room lifecycle

- Public rooms are tracked by the Matchmaker Durable Object.
- Quick Play reuses only joinable public rooms with **at least one connected real human**.
- If none exists, create a fresh public room.
- Real humans replace bots before roster lock.
- Public/bot-enabled matches guarantee five characters at start.
- The committed eight-second lobby countdown cannot be cancelled by readiness/join/leave changes.
- Explicit last-human leave abandons the public room immediately and removes its reusable state.
- Unexpected disconnects retain reconnect grace; the human may reclaim their identity during that window.

## Bot fill and readiness

- First bot after a new public human lobby: exactly 4.6 s.
- Subsequent bot fills: randomized 3.6–4.6 s.
- Humans can replace bots while matchmaking remains open.
- Readiness threshold counts humans only:
  - 1 human → 1 ready
  - 2 humans → 2 ready
  - 3 humans → 2 ready
  - 4 humans → 3 ready
  - 5 humans → 3 ready
- Bot ready displays may be staggered for presentation but never count toward human threshold.

## Final Two

- Trigger atmosphere whenever exactly two survivors remain.
- Announcement/swoosh is **one-shot per match**, triggered only on the first transition to two survivors.
- Persistent Final Two mode increases particle speed/density, star activity and arena glow.
- Music crossfades to a pitch-preserved version running approximately 15 BPM faster.
- If both survive a later round, atmosphere remains but announcement/swoosh do not replay.

## Podium / post-match flow

- Final elimination transitions to a synchronized podium scene.
- Winner receives one trophy.
- Gamer tags appear above podium characters.
- Trophy icon/count appears on the podium base only for players whose trophy count is >0.
- Winner crown appears beside the gamer tag and persists into the next match.
- Podium fanfare begins after the podium has visually appeared.
- After the podium, return directly to the ordinary lobby.
- All READY states reset. There is no REMATCH button/modal; players press READY normally.

## Visual system

- Game-controlled text uses the local `Tiles Pixel` font or sprite text treatment.
- Major controls use stepped pixel geometry rather than smooth modern browser styling.
- Dynamic names/room codes/counters remain real text semantically but render in the pixel font.
- Canvas sprite/image smoothing is disabled where applicable.
- Official Tiles logo remains the approved transparent PNG.
- Official app icon is the approved character + Tiles-logo icon.
- Background combines sparse colored shooting streaks with hollow-center four-pixel stars.
- Desktop and mobile-landscape landing pages retain glowing floating tile/character decorations.

## Responsive environments

Three deliberate layouts:

1. Desktop
2. Mobile landscape
3. Mobile portrait

A runtime viewport controller uses the visible viewport, orientation, safe-area insets and standalone/PWA state to fit the relevant layout. Essential mobile actions never require page scrolling.
