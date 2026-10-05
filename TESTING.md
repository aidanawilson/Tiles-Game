# Tiles V0.8 — Regression / Acceptance Testing

## Build / source checks

- [ ] `npm install` succeeds in a normal networked environment.
- [ ] `npm run typecheck` passes.
- [ ] `npm run build` passes.
- [ ] Cloudflare deployment binds both `GAME_ROOMS` and `MATCHMAKER`.
- [ ] No temporary validation stubs are included in the release ZIP.

## Pixel-art UI audit

- [ ] Homepage has no visible smooth/system font.
- [ ] Tutorial has no visible smooth/system font.
- [ ] Dynamic gamer tags render with Tiles Pixel.
- [ ] Room code, player states, selector copy, timers and podium values render with Tiles Pixel.
- [ ] Inputs retain native interaction but visually match pixel UI.
- [ ] Selector wheel/pointer have stepped/hard pixel silhouettes.
- [ ] Buttons/panels/settings/toasts do not look like modern rounded browser UI.
- [ ] No important icon or sprite becomes blurry when scaled.

## Player cards / podium

- [ ] Trophy icon and win count do not overlap at desktop size.
- [ ] Trophy/count remain aligned in mobile landscape.
- [ ] Portrait compact player strip does not overflow.
- [ ] Podium winner shows exactly one sprite frame at a time.
- [ ] Winner dance does not expose adjacent sprite cells.
- [ ] Zero-trophy podium positions display no trophy icon.
- [ ] Crown is beside latest winner's gamer tag, not attached to character sprite.
- [ ] Crown transfers correctly after the next winner.

## Movement

Use at least two real clients plus bots.

- [ ] Moving characters can cross/slide through one another without recoil or loop.
- [ ] Intermediate occupied route cells do not cancel movement.
- [ ] Human may target a currently occupied final tile.
- [ ] If occupant leaves before arrival, human enters normally.
- [ ] If final target remains occupied, human stops one tile short.
- [ ] Blocked target flashes red locally only.
- [ ] Blocked error sound plays locally only.
- [ ] No bump/recoil animation occurs.
- [ ] Two clients racing for same final empty tile resolve deterministically with no overlap.
- [ ] Bots use the same final-destination occupancy rule.
- [ ] A blocked bot resumes normal waypoint behavior later without being stuck.

## Audio

### Board flip
- [ ] Mechanical click fires with each visual tile flip.
- [ ] Left-to-right wave sound follows visual wave.
- [ ] 19 overlapping clicks remain quiet/clean rather than muddy.

### Tile break
- [ ] Ceramic cue plays once per doomed-color destruction event.
- [ ] Cue aligns with crack/drop, not board shuffle.

### Final Two
- [ ] Swoosh fires exactly once on first transition to two survivors.
- [ ] Banner enter/hold/exit motion fits the swoosh.
- [ ] Swoosh does not replay when both Final Two players survive another round.

### Podium
- [ ] Podium appears, then fanfare begins after the intended pause.
- [ ] Fanfare does not fire twice.

### Settings
- [ ] SOUND FX OFF disables all event SFX.
- [ ] MUSIC OFF disables normal and Final Two music.
- [ ] Haptics only activate when browser supports vibration and setting is ON.

## Final Two atmosphere

- [ ] Transition to exactly two survivors activates persistent Final Two mode.
- [ ] Shooting particles are clearly more active/brighter than normal.
- [ ] Hollow-center pixel stars remain visible and intensify.
- [ ] Arena frame glow is visibly stronger.
- [ ] Normal soundtrack crossfades to faster pitch-preserved version.
- [ ] Faster track sounds faster without a chipmunk/pitch-up effect.
- [ ] Track does not obviously restart at zero when Final Two begins.
- [ ] New match returns to normal-speed music.

## Post-match / lobby

- [ ] Final match transitions to podium.
- [ ] Podium remains synchronized for all clients.
- [ ] After podium, room returns directly to ordinary lobby.
- [ ] No REMATCH / Ready for Rematch UI appears.
- [ ] All human READY states are reset.
- [ ] Trophy totals remain.
- [ ] Latest-winner crown remains.
- [ ] Pressing READY starts the normal lobby flow again.

## Quick Play abandoned-room behavior

### Explicit leave
1. Start Quick Play with one human + bots.
2. Human intentionally presses Leave Room.
3. Verify the public room is no longer reusable.
4. Press Quick Play again from a fresh client.
5. Verify a fresh room is created rather than reopening the old bot state.

### Reconnect grace
1. Start a public room.
2. Close/reload the browser without Leave Room.
3. Reconnect within grace.
4. Verify same identity/state can reconnect.
5. Verify unrelated Quick Play users do not get matched into a zero-connected-human stale room during that grace period.

### Quiet-period judging case
- [ ] With no public room containing a connected human, the first Quick Play request always gets a fresh room.
- [ ] A second human can then join that live human room normally.

## Bot identity pool

- [ ] Pool contains exactly 250 preset names.
- [ ] 85 are human-style names/variants.
- [ ] 165 are arcade/gamer names.
- [ ] No duplicate visible names in a room.
- [ ] Bot name never duplicates a human's current visible name.
- [ ] No BOT label appears.

## Existing V0.7 regressions

- [ ] Invisibility hides board position from other players only.
- [ ] Override remains globally unique and guarantees next selector.
- [ ] Phase Shift works during 1.65 s reveal window.
- [ ] Spacebar activates a legal powerup unless focus is in editable input.
- [ ] 7.0 s movement timer is server-authoritative.
- [ ] 5.0 s choice timer is server-authoritative.
- [ ] Selector visual landing matches server-selected player.
- [ ] Bots-only endgame governor cannot intentionally choose selector's own color.
- [ ] Dead players never reappear in later tile-drop animations.

## Responsive / device tests

### Desktop
- [ ] Full layout fits and floating art/particles do not block controls.

### Mobile portrait
- [ ] No essential gameplay scrolling.
- [ ] Dynamic Island/notch safe area is respected.
- [ ] READY + LEAVE remain reachable in lobby.

### Mobile landscape browser
- [ ] VisualViewport fitting accounts for Safari/browser chrome.
- [ ] Power-Up | Arena | Players order is correct.
- [ ] No control is clipped by device cutouts.

### Installed Home Screen / PWA
- [ ] Uses additional available screen space without misalignment.
- [ ] Icon/manifest launch correctly.
