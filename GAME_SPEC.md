# Tiles V0.7 locked gameplay specification

## Match formats

- Quick Play: public, bot-enabled, five characters at match start.
- Created Public: discoverable, bot-enabled, five characters.
- Private + bots ON: filled to five; one human may play.
- Private + bots OFF: 2–5 humans, no bots.
- One life per match; last survivor wins. Session trophy totals persist between rematches.

## Movement

- 19-cell hexagonal arena with six floor colors.
- Movement lasts exactly **7.0 seconds** and displays a server-authoritative tenths timer.
- Tap/click any tile, including a currently occupied destination.
- Server pathfinds and resolves occupancy only when a movement step arrives.
- Moving characters do not create server collision events. The client may apply a small visual-only slide/rotation when sprites pass closely.
- Direct swaps/cycles are legal when all involved players vacate together.
- First authoritative arrival wins a simultaneous destination conflict; stable player id resolves an exact timestamp tie.
- A still-occupied final destination blocks entry without recoil. An occupied intermediate step triggers rerouting when possible.
- The selected destination gets a local-only pulsing edge glow.

## Powerups

Inventory has one slot. A powerup is collected by physically reaching its board tile. Legal held powerups may be clicked/tapped; Space is the desktop shortcut.

### Invisibility

- movement-phase activation only
- hides the player's arena sprite from every other player for the rest of the round
- owner sees a translucent self representation after a short pixel-glitch dissolve
- does not change occupancy, movement, player-list identity, or selector eligibility
- expires before the next shuffle

### Override

- movement-phase activation only
- guarantees the activator is the next selector
- authoritative selector id is still used by the normal wheel animation
- activator alone sees the blue/electric Override wheel treatment
- only one Override may exist across the entire match at once: on board, held, or pending
- pending Override is consumed when its forced selector event reaches color reveal

### Phase Shift

- reveal-phase activation only while standing on the doomed color
- reaction window is **1.65 seconds**
- teleports to a random safe, unoccupied, non-doomed tile
- visual identity: localized yellow lightning at the source, disappearance, lightning at the destination, reappearance

## Round sequence

1. Board shuffle: **1.2 s** total wave.
2. Pre-round countdown: **3.0 s**.
3. Movement: **7.0 s**.
4. Selector wheel: **5.0 s** phase; wheel visually spins/decelerates for ~4.55 s, then settles.
5. Color selection: **5.0 s**.
6. Doom reveal / Phase Shift window: **1.65 s**.
7. Results beat: **1.65 s**.
8. If multiple survivors remain, return to shuffle. Otherwise enter podium.

### Shuffle presentation

- all 19 physical hexes flip around a horizontal center axis
- old face compresses away, new face rises from the midpoint
- start times sweep left-to-right in screen space
- each individual flip is ~280 ms
- each tile finishes with a tiny settle bounce and quiet damped mechanical click
- no midpoint flash

### Pre-round cue

- three short tones during the 3-second pause
- GO tone exactly when movement unlocks
- supported devices receive light matching haptics, with a stronger GO tap
- board is fully readable while players are input-locked

## Selector

- modified-random fairness remains for normal rounds
- Override temporarily supersedes fairness for exactly one selector event
- visual landing is derived from the authoritative server-selected id
- wedge crossings tick as the wheel turns; final landing gets a stronger clunk
- selected player card pulses at landing
- bots retain a randomized 0.75–2.5 s decision delay
- selector may never deliberately choose its own current color when bot-controlled

## Eliminations

- doomed tiles crack/drop as complete 3D tiles
- characters on them enter a panic/fall animation and descend into the hole with the tile
- already-eliminated characters never render again in later drops
- player card flickers/dims into eliminated state

## Final Two

When exactly two survivors remain:

- `FINAL TWO` pixel-art banner flashes during the existing pre-round countdown
- particle intensity rises slightly
- arena-frame glow strengthens
- no extra gameplay delay is added

## Match finish / podium / crown

- final elimination transitions through a ~300 ms fade into a full-screen pixel-art podium scene
- podium presentation lasts about three seconds inside a 3.6-second synchronized server phase
- gamer tag remains above each podium character
- podium base shows a pixel trophy + win count only when that player's session wins are greater than zero
- first place receives a short victory dance
- a small gold crown animates beside the latest winner's gamer tag and remains there in the next match until another player wins
- after podium, room enters rematch state with a clear `REMATCH?` control

## Bots-only endgame governor

This activates only when no real human is alive and at least two bots remain.

- roll `botGraceRounds` from 1–3
- that many fully natural rounds may occur before a forced-progress selection attempt
- after every bot death, reset the counter and roll again
- if the previous grace value was 3, reroll any new 3 until the value is 1 or 2
- forced selector choice prefers a color occupied by exactly one other bot
- otherwise choose the occupied opponent color with the fewest bots
- never intentionally choose the selector bot's own current color
- if no legal opponent color exists, make a normal safe choice and keep forced progress pending
- never reposition bots secretly to manufacture a death

## Tutorial

Page 1:
1. Tap a tile to move to it.
2. Pick a color to eliminate.
3. Be the last one standing.

Page 2 title: `POWERUPS`
- Invisibility
- Override
- Phase Shift

Exact instruction: **Pick up powerups while you move, and click them to activate them.**

Eligible mobile-browser sessions show **ADD TO HOME SCREEN FOR BETTER GAMEPLAY / SHOW ME HOW** as an expandable callout. Page 1 and Page 2 use different-color characters standing beside and pointing toward the forward button. Final button is `LET'S GO`.

## Interface / presentation rules

- desktop, mobile landscape, and mobile portrait are explicit layouts
- `visualViewport` and safe areas fit the UI to Safari/PWA usable space
- no mobile scrolling is required for essential controls
- all important new banners, timer digits, crown/trophy/rematch art, settings icon, and Override treatment are pixel-art/sprite-based
- dynamic gamer tags remain text
- all Tiles-logo confetti originates immediately at the lower logo corners
- home screen settings owns Music, Sound FX, and feature-detected Haptics; no persistent floating mute control
