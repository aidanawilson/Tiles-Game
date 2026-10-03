# Tiles V0.3 test checklist

## Deployment smoke test

1. Push the complete repo to GitHub.
2. Let the connected Cloudflare Worker build with `npm run build` and deploy with `npx wrangler deploy`.
3. Confirm the deployment reports the `GAME_ROOMS (GameRoom)` Durable Object binding.
4. Open the workers.dev URL before attaching/changing the production subdomain.

## Two-device test

1. Create a room on desktop.
2. Join from an iPhone/Android device.
3. Confirm each player receives a different character color.
4. Ready both players and start.
5. Tap distant tiles rapidly; movement should be visually continuous rather than stopping at every hex.
6. Confirm both devices show the same player locations and round result.

## Visual test

- 19 extruded hex tiles are visible and easy to tap.
- Tile colors reshuffle every round.
- Player sprites animate while idle and moving.
- Player color in the right-side list matches the arena sprite.
- The selector wheel removes eliminated players and uses only eligible player colors.
- The color selector popup has six colors and no extra Tiles logo.
- The doomed floor visibly progresses through warning/crack/drop states.
- The UI has no permanent countdown timer or MOVE PHASE banner.

## iPhone landscape tutorial regression test

1. Open on an iPhone in Safari or Home Screen mode.
2. Rotate to landscape before/during the tutorial.
3. Confirm tutorial content may scroll internally if necessary.
4. Confirm SKIP/NEXT/BACK/I'M READY remain reachable.
5. Confirm tutorial says Tap, not keyboard/key language.

## iOS reconnect regression test

1. Join a room from an iPhone Home Screen installation.
2. Note the player's name, color, and trophy count.
3. Close the web app completely.
4. Reopen and return/resume the same room within 45 seconds.
5. Confirm the original seat is reclaimed.
6. Confirm there is NOT a duplicate player with the same name.
7. Confirm the same character color and trophy count are preserved.

## Audio

- Music starts only after a user interaction if autoplay is blocked.
- Music loops without restarting each round.
- Mute button works.
- Mute choice persists on the device.
