# Tiles V0.6 test checklist

## Build / deploy

1. `npm install`
2. `npm run check`
3. `npx wrangler deploy`
4. Confirm `GAME_ROOMS` and `MATCHMAKER` bindings.
5. Smoke-test workers.dev before custom-domain rollout.

## Movement / occupancy regression

1. Click a tile currently occupied by a stationary second player.
2. Confirm the first player walks all the way toward it, then stops outside if the occupant remains.
3. Move the occupant away before arrival and confirm the incoming player enters normally.
4. Send two players directly through one another and confirm they visually slide past without recoil/stun/server collision state.
5. Make two players swap starting tiles and confirm both complete the swap.
6. Make two players arrive at the same empty tile simultaneously; confirm one deterministic winner and no overlap.
7. Route through a stationary occupied intermediate tile and confirm rerouting rather than collision looping.
8. Rapidly retarget while moving and confirm movement remains responsive.

## Destination glow

- local clicked tile receives a subtle pulsing edge glow immediately
- only the selecting client sees it
- selecting a new tile moves the glow
- it clears after arrival, blocked completion, phase change or elimination

## Bubble

1. Activate Bubble and target an occupied non-Bubble player's tile.
2. Confirm the occupant moves to a valid adjacent tile and Bubble claims the original tile.
3. Confirm the victim is never pushed outside the 19-cell board.
4. Block all adjacent victim tiles and confirm Bubble is denied entry rather than overlapping.
5. Bubble-vs-Bubble: confirm neither is displaced.
6. Confirm displaced player can collect a powerup on its landing tile and can resume a remaining destination.

## Viewport / environment matrix

Test each in both lobby and live game:

- desktop browser
- iPhone portrait Safari
- iPhone landscape Safari with browser chrome visible
- iPhone portrait Home Screen PWA
- iPhone landscape Home Screen PWA
- Android portrait browser if available
- Android landscape browser if available

For every mobile case:

- no essential control is offscreen
- no page scrolling is needed for gameplay
- Dynamic Island/notch/home indicator covers no functional element
- top margin is compact rather than oversized
- landing code input + Join button remain within the panel
- landscape order is Power-Up | Arena | Players
- portrait uses player strip → arena → compact powerup
- lobby shows Ready and Leave Room together
- resize/browser toolbar changes do not permanently misalign the interface

## Tutorial

- page 1 displays the three exact steps from `GAME_SPEC.md`
- character visibly cues the Next button
- page 2 says POWERUPS and shows Speed/Bubble/Phase Shift
- exact pickup/activation sentence appears
- Add to Home Screen callout is prominent on eligible native mobile browser sessions
- Show Me How expands/collapses instructions
- final button says LET'S GO
- final character treatment is different from page 1
- buttons remain reachable in portrait and short landscape browser viewports

## Presentation

- sparse colored shooting stars appear behind all screens and never capture pointer input
- floating landing tiles glow and emit subtle pixel sparks on desktop/landscape
- portrait hides landing floating islands
- every Tiles logo has static lower-corner confetti
- homepage Apogee Lab logo/text is small, clickable and opens apogeelab.org
- reduced-motion mode disables continuous decorative animation

## Existing systems regression

- Quick Play bot-fill timing still works
- humans still replace bots before roster lock
- committed eight-second countdown does not reset
- public/bot-enabled matches still begin with five characters
- selector wheel visual result matches authoritative chooser
- tile drop never resurrects previously eliminated players
- trimmed music loops and mute preference persists
