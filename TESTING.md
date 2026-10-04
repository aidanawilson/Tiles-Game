# Tiles V0.7 test checklist

## Build / deploy

1. `npm install`
2. `npm run check`
3. `npx wrangler deploy`
4. Confirm `GAME_ROOMS` and `MATCHMAKER` bindings.
5. Smoke-test workers.dev before the custom domain.

## Timers / synchronized cadence

- movement starts at `7.0` and counts down smoothly to tenths
- selector color-choice starts at `5.0`
- timers are sprite digits rather than browser-font numerals
- three pre-round beeps happen during the 3 s pause
- GO sound occurs exactly when movement becomes legal
- second phone observes the same phase boundaries within network latency
- no player can move or activate Invisibility/Override during pre-round

## Shuffle

- all tiles flip rather than instantly recolor
- wave travels left-to-right
- each flip is roughly 280 ms with a small settle bounce
- soft mechanical click aligns with each tile finishing
- no white/midpoint flash
- player positions remain associated with the correct physical board cells

## Invisibility

1. Collect and activate during movement.
2. Owner sees the short glitch effect then a translucent self.
3. Other client sees the glitch effect then no arena sprite.
4. Invisible player still blocks an occupied destination and collects items normally.
5. Player list still shows the invisible player.
6. Visibility resets before the next shuffle.
7. Activation outside movement is ignored.

## Override

1. Confirm at most one Override exists across board + all inventories + pending state.
2. Pick it up; confirm another cannot spawn while held.
3. Activate during movement; confirm powerup is consumed and pending state remains.
4. Next wheel must visually land on the activator on every client.
5. Only the activator sees electric-blue Override presentation.
6. After selection is consumed, Override becomes eligible to spawn again later.
7. Disconnect/leave the pending owner and confirm stale pending state cannot block future selector logic indefinitely.

## Phase Shift

- threatened player has approximately 1.65 s to activate
- Space/click/tap works only during the legal reveal state
- yellow lightning appears at source, character disappears, destination lightning strikes, character reappears
- destination is safe, unoccupied, and non-doomed

## Movement regression

- occupied destination can be clicked
- if occupant leaves before arrival, incoming player enters
- if occupant remains, incoming player stops outside without recoil
- two moving players visually slide past rather than collide
- direct swaps work
- simultaneous same-target arrivals yield one deterministic owner
- rapid retargeting does not duplicate the current movement step
- local destination glow moves with retargeting and is never broadcast

## Selector suspense

- spin remains reasonably fast but decelerates noticeably at the end
- boundary ticks accelerate/decelerate plausibly with the visual wheel
- final landing uses a stronger clunk
- selected player card pulses at landing, not spin start
- 2/3/4/5-player wheel pools land on the server-selected player

## Elimination

- doomed character changes into panic/fall motion before dropping
- tile and character descend together
- local eliminated player gets a short haptic vibration only on supported devices when enabled
- previously eliminated characters never reappear during future reveals
- eliminated player card flickers/dims once

## Final Two

- triggers at exactly two survivors
- banner appears during the existing pre-round sequence without adding time
- particle field becomes slightly more intense
- arena frame glow strengthens
- effect ends after the match or when leaving the state

## Podium / crown / rematch

- match end transitions into a full-screen podium rather than freezing the board
- map fades out over roughly 300 ms before podium presentation reads clearly
- 1st/2nd/3rd ordering follows final placement
- gamer tag appears above each character
- zero-win podium has no trophy icon; positive wins show pixel trophy + count on podium base
- first-place character visibly celebrates
- crown animates beside the latest winner's gamer tag
- crown persists beside that player during the next match and transfers after a different winner
- podium cannot award a second winner if somebody leaves during the podium phase
- after podium, `REMATCH?` is obvious; session trophies remain

## Bots-only endgame

- with any human alive, normal bot selector behavior remains
- after all humans die, grace value is 1–3
- grace value 3 may never be rolled twice consecutively
- a natural bot death immediately resets/re-rolls grace
- after grace expires, selector targets exactly one opponent when possible
- otherwise targets the least-populated opponent color
- selector bot never intentionally selects its own tile color
- two bots sharing the same color do not suicide; safe/random choice is allowed and forced progress remains pending
- decision delay remains 0.75–2.5 s

## Settings / haptics

- persistent floating sound button is absent
- home-screen gear opens settings
- Music and Sound FX persist locally
- Haptics appears N/A/disabled when `navigator.vibrate` is unavailable
- supported device receives three light countdown taps plus stronger GO tap
- disabling haptics suppresses vibration

## Tutorial

- exact three gameplay steps appear on page 1
- page 1 character stands beside and points at NEXT
- page 2 shows exactly Invisibility / Override / Phase Shift icons with no neighboring atlas cells visible
- exact powerup instruction sentence appears
- page 2 uses a different-color standing/pointing character beside LET'S GO
- Add to Home Screen instructions expand only when requested
- all tutorial controls remain reachable in desktop, mobile portrait, short mobile landscape, and native-browser viewport

## Responsive matrix

Repeat lobby, live game, selector, Final Two, and podium in:
- desktop browser
- iPhone portrait Safari
- iPhone landscape Safari with browser chrome visible
- iPhone portrait Home Screen PWA
- iPhone landscape Home Screen PWA
- Android portrait/landscape browser when available

Confirm no essential control clips under safe areas, no page scrolling is required for gameplay, and the pixel timers/podium fit the active layout.
