# Tiles V0.5 locked gameplay specification

## Match formats

- Quick Play: public matchmaking, bots enabled, always five characters at match start.
- Created Public: matchmaking enabled, bots enabled, always five characters at match start.
- Private + bots ON: matchmaking disabled, bot-filled to five characters; one human may play.
- Private + bots OFF: matchmaking disabled, no bots, 2–5 human players.

## Ready threshold

Bots never count toward the readiness threshold. Human votes required:

- 1 human → 1 ready
- 2 humans → 2 ready
- 3 humans → 2 ready
- 4 humans → 3 ready
- 5 humans → 3 ready

Equivalent rule for N >= 2: `floor(N / 2) + 1`.

Once the eight-second final countdown begins, the start is committed. Joins, leaves, replacements, host changes, or later readiness changes do not cancel it.

## Public bot fill

- First bot joins after exactly 4.6 seconds when the first human creates/enters an empty bot-enabled lobby.
- Further bots join after independent random 3.6–4.6 second intervals.
- Before roster lock, a real human replaces an existing bot instead of increasing the visible player count.
- At countdown zero, bot-enabled rooms fill any remaining vacancies immediately and lock the roster.
- Per-player bot identity is server-private and not shown in normal UI/state.
- Bot names come from a fixed ~200-name arcade/gamer pool with collision avoidance against visible room names.

## Arena / movement

- 19-cell hexagonal arena.
- Six floor colors: red, orange, yellow, green, blue, violet.
- Board colors regenerate every round with bounded uneven randomness.
- Tap/click a reachable tile; the server computes the route.
- One player per logical tile.
- Movement phase: ~7 seconds.
- Bots choose 2–6 waypoint destinations distributed across the movement window and use the same pathfinding/collision system as humans.

## Collision system

- Collision outcomes are decided server-side when impact is detected.
- Each event receives a unique collision ID, partner, role, timestamps, and a reserved resolution tile.
- Head-on collisions use two distinct preselected sidestep/recovery positions.
- Same-target/glancing collisions deterministically assign priority/yield behavior.
- A pair-specific cooldown prevents an immediately repeated collision between the same two players.
- Third players are routed around active collision recovery reservations.
- Client animation uses staged approach → impact → recoil → curved sidestep/recovery → resume movement.
- Original destinations are preserved and routes are recomputed after recovery.

## Power-ups

Maximum one held item.

### Speed

Temporary movement-speed increase.

### Bubble

- Manual movement-phase activation.
- Four-second server-authoritative duration.
- No numeric countdown UI.
- Visible translucent energy bubble around the character.
- Bubble vs normal player: victim is knocked one adjacent valid tile in the impact direction; nearest valid fallback is used when needed.
- If no displacement tile is valid, the victim receives recoil but stays put.
- Knocked players can collect a power-up on their landing tile if their slot is empty.
- Bubble vs Bubble: normal collision rules.

### Phase Shift

During the 1.15-second doomed-color reveal, a threatened player may activate Phase Shift to teleport to a random safe unoccupied non-doomed tile.

## Selector

- Modified-random fairness cycle retained.
- Eliminated players are skipped.
- Bots wait 0.75–2.5 seconds, then choose a random color other than the color beneath themselves.
- Other players see the selected player's actual name in the choosing overlay.

## Elimination / win

- One life per match.
- Falling is caused by selected-color tile collapse, not the arena perimeter.
- Eliminated players spectate.
- Last survivor receives one session trophy.
- Trophy counts persist across rematches for the room/session.
