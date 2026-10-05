# Tiles V0.9 — Regression / Acceptance Testing

## Build / source checks

- [ ] `npm install` succeeds in a normal networked environment.
- [ ] `npm run typecheck` passes.
- [ ] `npm run build` passes.
- [ ] Cloudflare deployment binds both `GAME_ROOMS` and `MATCHMAKER`.
- [ ] No temporary validation stubs or `node_modules` are included in release ZIP.
- [ ] No client code uses `new Audio(...)` for soundtrack management.
- [ ] No Media Session metadata/background-media registration exists.

## Mobile viewport/layout

### iPhone Safari portrait
- [ ] No essential vertical scroll.
- [ ] Header fully visible.
- [ ] Horizontal player strip fits.
- [ ] Arena fully visible.
- [ ] Power-up panel remains shallow.
- [ ] READY / LEAVE fully visible above Safari/home-indicator area.
- [ ] Opening/closing Safari chrome does not clip controls.

### iPhone PWA portrait
- [ ] Safe areas respected.
- [ ] No excessive top/bottom margins.
- [ ] All essential gameplay UI visible simultaneously.

### iPhone Safari landscape
- [ ] Layout order is `Power-Up | Arena | Players`.
- [ ] Protected bottom action row remains visible.
- [ ] Compact mode engages at constrained visualViewport height.
- [ ] Arena shrinks before essential buttons disappear.
- [ ] Dynamic Island/notch safe side remains usable.

### iPhone PWA landscape
- [ ] Three-column layout fits without scrolling.
- [ ] No home-indicator clipping.
- [ ] Side panels remain readable but do not steal arena/control space.

### Rotation / browser chrome
- [ ] Portrait → landscape mid-lobby recomputes correctly.
- [ ] Landscape → portrait mid-match keeps canvas overlays aligned.
- [ ] `visualViewport` resize/scroll from Safari chrome updates layout without a refresh.

### Landing/settings
- [ ] Browser portrait landing card/footer fits.
- [ ] Browser landscape landing card does not overflow.
- [ ] Decorative floating characters yield space in compact mode.
- [ ] Settings panel stays inside usable viewport.

## Audio foreground lifecycle

On real iOS Safari and installed PWA:

- [ ] Music begins after a legitimate user interaction.
- [ ] Lock phone while music plays → Tiles audio stops immediately.
- [ ] Return to iOS Home Screen → Tiles audio stops immediately.
- [ ] Switch to another app → Tiles audio stops.
- [ ] Switch Safari tab → Tiles audio stops.
- [ ] Backgrounded Tiles does not intentionally present persistent lock-screen/Dynamic-Island media controls.
- [ ] Return to Tiles → only the currently appropriate soundtrack resumes.
- [ ] Missed selector ticks do not replay.
- [ ] Missed board-flip clicks do not replay.
- [ ] Missed break/fanfare cues do not replay.
- [ ] Repeated background/foreground cycles do not permanently silence music.
- [ ] If existing AudioContext is interrupted, recovery/watchdog restores soundtrack after a valid resume/unlock condition.

## Audio mix / sliders

- [ ] Music is noticeably ~35% lower than V0.8 baseline at displayed 100.
- [ ] Selector wheel ticks are clearly audible over music.
- [ ] Wheel landing clunk remains distinct.
- [ ] MUSIC VOLUME slider shows 100 by default.
- [ ] SOUND EFFECTS slider shows 100 by default.
- [ ] Both move in 5% steps from 0–100.
- [ ] Music slider affects normal and Final Two tracks live.
- [ ] SFX slider affects event sounds + synthesized tones.
- [ ] SFX slider release/key release gives a small preview cue.
- [ ] Volume preferences survive reload.
- [ ] Setting volume to 0 behaves as muted and remains persisted.

## Final Two music reliability

- [ ] Normal track crossfades to Final Two without silence.
- [ ] Repeated Final Two state packets do not restart/retrigger transition.
- [ ] If Final Two source cannot be prepared, currently working music is not intentionally stopped first.
- [ ] Equivalent normalized song position is preserved.
- [ ] New match returns to normal soundtrack mode.

## Inactivity cleanup

Use two humans plus bots where possible.

- [ ] Human makes one movement input → not removed after match.
- [ ] Human manually chooses one color → not removed.
- [ ] Human legally activates one held powerup → not removed.
- [ ] Human targets an occupied destination and is blocked → still counts as activity.
- [ ] Human does absolutely no gameplay input for whole match → remains through match/podium, then removed.
- [ ] Removed client returns home with `REMOVED FOR INACTIVITY`.
- [ ] Removed player's room reconnect identity cannot immediately restore them.
- [ ] READY alone does not count as match activity.
- [ ] Volume/settings changes do not count.
- [ ] Dead player who acted before elimination is not removed for inactivity.
- [ ] Bots are never removed by inactivity policy.
- [ ] If inactivity removes final human from public room, room is abandoned/not reusable by Quick Play.

## Bot human-present governor

Create match with at least one living human and multiple bots.

- [ ] Governor can force progress after its grace window while a human is alive.
- [ ] Bot never intentionally chooses its own current tile color.
- [ ] Bot-only candidate colors are preferred over human-containing candidates.
- [ ] Human-containing colors are still sometimes chosen; human is not immune.
- [ ] Mixed human+bot color receives the human-protection roll.
- [ ] No selection decision hangs from an infinite reroll.
- [ ] Visible selector delay remains 0.75–2.5 s; hidden rerolls are not perceptible.
- [ ] Natural elimination grants another human-phase grace window.

### Bot-only compatibility
- [ ] Once `humanAliveCount === 0`, original bots-only governor behavior is unchanged.
- [ ] Grace is 1–3 rounds.
- [ ] 3 is never rolled twice consecutively within bot-only governor history.
- [ ] Natural bot death resets/rerolls.
- [ ] Forced choice prefers exactly-one bot target, then fewest bots.
- [ ] No hidden bot movement manipulation occurs.

## Movement regression

- [ ] Moving players can cross/slide without bump/recoil loops.
- [ ] Intermediate occupied cells do not cancel movement.
- [ ] Occupied final target may be selected.
- [ ] If target frees before arrival, mover enters it.
- [ ] If target remains occupied, mover stops one tile short.
- [ ] Human receives local red flash + blocked SFX only.
- [ ] Bots obey same final destination rule without local feedback.
- [ ] Simultaneous final claims never produce persistent overlap.

## Post-match / room lifecycle

- [ ] Final elimination → podium.
- [ ] Podium → inactivity cleanup → normal lobby.
- [ ] No REMATCH UI appears.
- [ ] READY resets.
- [ ] trophies and latest-winner crown persist unless winner was removed for inactivity.
- [ ] Explicit final-human leave abandons public room immediately.
- [ ] Unexpected disconnect still gets reconnect grace.
- [ ] Fresh Quick Play after zero-human abandonment never lands in stale prior bot state.

## Favicon/PWA icon

- [ ] Browser tab uses current approved Tiles icon.
- [ ] 16/32/64/ICO favicon assets are current.
- [ ] Apple touch icon is current.
- [ ] Add to Home Screen uses current icon.
- [ ] Manifest 192 and 512 icons use V0.9 cache-busted paths.
- [ ] No HTML/manifest reference points to old artwork.

## Pixel/UI regression

- [ ] Visible game text remains Tiles Pixel.
- [ ] Pixel sliders do not expose native range styling.
- [ ] Settings controls remain finger-sized.
- [ ] Podium animation still snaps exact sprite frames.
- [ ] Trophy icon/count remain non-overlapping.
- [ ] Final Two one-shot banner and atmosphere still work.
