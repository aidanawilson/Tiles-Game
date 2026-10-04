# Tiles V0.6 locked gameplay + interface specification

## Match formats

- Quick Play: public, bot-enabled, exactly five characters at match start.
- Created Public: discoverable, bot-enabled, exactly five characters.
- Private + bots ON: bot-filled to five; one human may play.
- Private + bots OFF: 2–5 humans, no bots.

## Movement

- 19-cell hexagonal board; six floor colors.
- Movement phase is approximately seven seconds.
- Tap/click a tile and the server computes a route.
- An occupied destination is a valid selection.
- Player proximity while moving is not a collision condition.
- The client may apply a small visual-only perpendicular slide/rotation when two moving sprites pass closely.
- Tile occupancy is resolved only when a player reaches a movement step.
- If two players reach the same empty tile, the first authoritative arrival wins; stable player id breaks an exact timestamp tie.
- Direct swaps/cycles are permitted when every participant vacates its current tile in the same authoritative resolution.
- If a requested final tile is still occupied, the arriving player stops outside it and the route ends.
- If an intermediate cell is occupied, the server attempts to reroute around that cell.
- No normal knockback, recoil, stun, collision cooldown, or collision-loop state exists.

## Local destination feedback

The tile selected by the local player receives a subtle pulsing gold/white edge glow. This cue is client-only and is never broadcast to other players. It clears on arrival, blocked completion, elimination, or phase change.

## Bubble

- Manual movement-phase activation.
- Four seconds, server authoritative, no numeric HUD countdown.
- Visible translucent sphere remains around the active character.
- When a Bubble player attempts to enter a tile occupied by a non-Bubble player, the victim is displaced one valid adjacent tile if possible and Bubble claims the original tile.
- Preferred displacement direction is away from the Bubble source; nearest valid adjacent fallback is used.
- If no valid adjacent tile exists, Bubble cannot enter and no overlap is allowed.
- Bubble-vs-Bubble behaves like a normally occupied tile.
- A displaced player can collect a powerup on the landing tile and resumes its previous destination when a route remains.

## Other powerups

### Speed
Temporary movement-speed increase.

### Phase Shift
During the 1.15-second doomed-color reveal, teleports a threatened player to a random safe unoccupied non-doomed tile.

## Selector

- Modified-random fairness cycle retained.
- Eliminated players are skipped.
- Bots wait 0.75–2.5 seconds before choosing.
- Bots avoid intentionally choosing the color directly beneath themselves.
- V0.5.3 wheel geometry remains authoritative: the wheel always lands on the server-selected chooser.

## Interface environments

The client selects exactly one main composition:

- desktop
- mobile landscape
- mobile portrait

The environment controller measures `visualViewport` when available, detects standalone/Home Screen display mode, and exposes the current usable width/height and UI scale through CSS variables. Browser chrome, orientation changes, and viewport resize events trigger recalculation.

### Mobile invariants

- no required page scrolling for gameplay controls
- safe-area insets protect Dynamic Island/notch/home indicator
- Ready and Leave Room remain simultaneously reachable in lobby/rematch states
- arena gets priority over decoration
- decorative elements disappear/reduce before functional UI is compressed beyond usability
- native browser mode may use a tighter scale than the installed PWA on the same phone

## Tutorial

Page 1:

1. Tap a tile to move to it.
2. Pick a color to eliminate.
3. Be the last one standing.

Page 2 title: `POWERUPS`

Shows Speed, Bubble, Phase Shift and the text:

`Pick up powerups while you move, and click them to activate them.`

On eligible mobile browser sessions, show a prominent expandable callout:

`ADD TO HOME SCREEN FOR BETTER GAMEPLAY` / `SHOW ME HOW`

Final CTA: `LET'S GO`.

Tutorial navigation includes a character cue beside Next and a different playful character pose by the final CTA.

## Branding / background

- final PNG Tiles logo everywhere
- static six-color pixel confetti from both lower logo corners
- sparse tile-color shooting-star particles behind all UI
- landing floating tiles receive matching glow, halo and pixel-spark effects on desktop and mobile landscape
- small clickable Apogee Lab mark + text on the homepage
