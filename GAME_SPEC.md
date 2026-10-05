# Tiles V0.9 — Game Specification

## Match format

- 19-cell hex arena (`BOARD_RADIUS = 2`).
- Up to five characters.
- Quick Play, Public, and Private + Bots ON begin matches with five characters.
- Private + Bots OFF uses the actual 2–5 human roster.
- One life per match; eliminated players spectate.
- Last survivor earns one persistent room/session trophy.
- The most recent winner owns the gold crown until another player wins.

## Round phases

1. **Shuffle** — tiles flip into newly randomized colors in a left-to-right wave.
2. **Pre-round** — planning beat / countdown.
3. **Movement** — exactly 7.0 seconds with visible tenths timer.
4. **Selector wheel** — server-authoritative selector result.
5. **Selector choice** — exactly 5.0 seconds to choose a doomed color.
6. **Reveal** — 1.65-second reaction window; Phase Shift may be used if threatened.
7. **Drop / results** — selected-color tiles break/fall; doomed characters fall with them.
8. Repeat until <=1 character remains alive.

## Movement

- Tap/click a destination tile.
- The server pathfinds toward the target.
- Moving characters may cross/slide visually past one another; intermediate route cells do not cause knockback, bump loops or collision cancellation.
- An occupied tile may still be targeted because its occupant could move before arrival.
- Occupancy is enforced only when entering the **final selected destination**.
- If final target is free on arrival, enter normally.
- If final target is still occupied, stop on the previous valid tile and end that command.
- Humans receive a private red double-flash plus blocked-destination SFX; other clients do not.
- Bots use the exact same server occupancy rule without human-facing feedback.
- Simultaneous final claims resolve server-side with one tile owner.

## Powerups

One inventory slot per player.

### Invisibility
- Manually activated during movement.
- Other clients do not see the owner's arena sprite for the rest of that round.
- Owner retains translucent/glitching self-view.
- Server occupancy remains real.

### Override
- Globally unique across board, inventory and pending-selector state.
- Guarantees its owner becomes next selector.
- The authoritative wheel still spins/lands on that owner.
- Only the owner sees the blue/electric Override wheel treatment.

### Phase Shift
- Emergency reveal-window powerup.
- If threatened by the doomed color, teleports to a random safe unoccupied non-doomed tile.
- Uses yellow source/destination lightning effect.

Desktop **Spacebar** activates a legal held powerup except while typing.

## Selector fairness

- Modified fairness cycle remains authoritative.
- Eliminated players are excluded.
- Override supersedes fairness for one selector event.
- Wheel graphics always derive from the server's selector ID.

## Bots

- Same movement/final-occupancy rules as humans.
- Roughly 2–6 movement waypoints per movement phase with natural pauses.
- Bots may collect/use powerups.
- Selector delay remains randomized about 0.75–2.5 seconds.
- Forced-progress logic never intentionally selects the bot selector's own current color.

### Human-present elimination governor — V0.9

While at least one real human is alive and at least two bots are alive, a separate progress governor runs throughout the match.

- It receives a 1–3-round grace window and avoids consecutive 3-round grace values.
- Any natural elimination grants another grace window.
- Once grace expires, a selected bot seeks opponent-bearing target colors, prioritizing lower opponent occupancy.
- A candidate containing **no living human** is accepted immediately.
- A candidate containing any living human is accepted with **1/3 probability** and rejected with **2/3 probability**.
- A mixed color containing both bots and a human still receives the human-protection roll.
- Rejected candidates are evaluated internally within bounded passes; no unbounded reroll loop is permitted.
- If every legal opponent target is human-containing and repeatedly rejected, a bounded legal-target fallback prevents deadlock.
- This hidden decision process does not remove the normal 0.75–2.5 s visible selector delay.
- Humans are favored, not immune.

### Bots-only endgame governor — preserved from V0.8

When no real human remains alive and more than one bot survives:

- roll 1–3 grace rounds after entering bots-only play and after every natural bot elimination;
- a grace value of 3 may never occur twice consecutively;
- after grace expires, prefer a color occupied by exactly one opponent bot;
- otherwise choose the least-populated opponent-bot color;
- never intentionally choose selector's own current color;
- if no safe opponent target exists, make a normal legal safe choice and carry the progress need forward;
- never secretly reposition bots to manufacture a death.

The human-present governor is separate so it does not alter the original bots-only governor's grace history.

## Public matchmaking / room lifecycle

- Public rooms are tracked by Matchmaker Durable Object.
- Quick Play reuses only joinable public rooms containing at least one connected real human.
- If none exists, create a fresh public room.
- Humans replace bots before roster lock.
- Public/bot-enabled matches fill to five characters at start.
- Committed eight-second lobby countdown is not cancelled by readiness/join/leave changes.
- Explicit last-human leave abandons the public room immediately.
- Unexpected disconnects retain reconnect grace.
- Post-match inactivity removal that leaves a public room with zero humans also abandons it.

## Inactivity policy — V0.9

At committed match start, each real human's `madeGameInputThisMatch` state is effectively false.

Meaningful activity is granted for a valid-context attempt to:
- move during movement while alive;
- choose a color while that human is the selector;
- use a held powerup while alive during a legal activation phase.

The attempted gameplay input counts even when the eventual game outcome is blocked or unsuccessful.

The following do not count:
- lobby READY;
- settings / volume / haptics changes;
- passive connection;
- mouse/pointer movement;
- server timeout choices;
- spectating.

Bots are exempt. Nobody is kicked during the match. After the podium, any zero-input human is sent `removed-inactivity`, their room reconnect credentials are invalidated, they are removed from the roster, and their client returns home with a `REMOVED FOR INACTIVITY` notice.

## Final Two

- Exactly two survivors activates persistent Final Two atmosphere.
- Banner + swoosh fires once on the first 3+ → 2 transition only.
- Persistent state strengthens particles, cross-stars and arena glow.
- Music switches to the pitch-preserved ~15 BPM faster variant at equivalent normalized track progress.

## Podium / post-match

- Final elimination transitions to synchronized podium.
- Winner receives one trophy.
- Latest winner gets crown beside gamer tag; crown persists into next match.
- Podium fanfare begins after podium visually appears.
- After podium, run inactivity cleanup, then return directly to ordinary lobby.
- READY resets; trophies/crown persist; no REMATCH modal/button.

## Audio system — V0.9

One persistent Web Audio manager owns the session's output:

`MASTER → MUSIC BUS → normal/final-two sources`

`MASTER → SFX BUS → event sounds + synthesized tones`

Rules:
- music tuned max is 65% of the previous V0.8 music ceiling;
- selector wheel tick is approximately 25% stronger than V0.8;
- user Music and SFX sliders are 0–100, default 100, 5% increments;
- slider values multiply tuned internal ceilings and persist locally;
- hidden/background/locked page immediately stops active music/SFX and suspends context;
- foreground restores only current appropriate music, not missed event sounds;
- scheduled event SFX are checked against authoritative timestamps to discard stale callbacks;
- normal/Final Two transition starts destination source before stopping the source already working;
- watchdog/recovery path restores desired music after browser/iOS interruption;
- no deliberate Media Session / background-player registration.

## Responsive environments — V0.9

Runtime layout modes:
1. desktop
2. mobile portrait PWA
3. mobile portrait browser
4. mobile landscape PWA
5. mobile landscape browser
6. compact landscape PWA/browser variants

Viewport sizing uses `visualViewport`, orientation, standalone detection and safe-area environment values.

Mobile requirements:
- essential room UI does not require page scrolling;
- READY / LEAVE receives protected layout space;
- portrait uses compact header + horizontal player strip + arena + shallow power panel + action row;
- landscape uses `Power-Up | Arena | Players` + protected action row;
- decoration/padding/arena size yield before essential controls;
- safe areas protect Dynamic Island/notch/home indicator and Safari chrome constraints.

## Visual system / icons

- Visible game-controlled text uses `Tiles Pixel` or sprite text treatment.
- Controls use stepped pixel geometry.
- Official current Tiles app icon is used for favicon, Apple touch and PWA assets.
- V0.9 icon paths are cache-busted in HTML/manifest.
