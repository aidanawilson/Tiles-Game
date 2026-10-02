# Tiles V0.2 — First Playtest

Do this before investing in sprite art.

## Build sanity

```bash
npm install
npm run check
npm run dev
```

## Two-player minimum test

1. Create a room in browser/device A.
2. Join the code in browser/device B.
3. Confirm both screens show both players.
4. Ready B; confirm A can start the match.
5. Confirm 3 → 2 → 1 countdown and a 19-hex board.
6. Tap several distant tiles on both devices and confirm both screens agree on movement.
7. Change destinations rapidly, then verify inputs stop changing course during a committed collision/recovery.
8. Force a head-on route swap and a glancing/same-target collision.
9. Race for a power-up; confirm only the character that reaches its tile first receives it.
10. Play through several selector rounds and confirm the board colors reshuffle every round.
11. Verify only the selected color drops and only players on that color are eliminated.
12. If Phase Shift appears, stand on the doomed color and activate it during the 1.15 s reveal window.
13. Finish a match and confirm the winner gains one trophy.
14. Start a rematch and confirm trophies remain.

## Reconnect test

1. During a room, refresh one player's tab.
2. Confirm it returns as the same player instead of creating a duplicate.
3. Close a player's tab for less than 45 seconds, reopen/rejoin in the same tab session if possible, and verify the reserved seat behavior.
4. Disconnect the host and confirm host authority transfers to a connected player.

## Multi-device test

After local testing, deploy to Cloudflare and repeat on:

- one phone + one laptop
- two phones
- landscape phone layout
- portrait phone layout
- ideally one device on Wi-Fi and one on cellular

## Feedback to capture

For the next revision, note:

- Does 19 tiles feel crowded in a good way or frustrating?
- Is 180 ms per hex fast enough?
- Is 7 seconds the right movement window?
- Is the selector's 4-second choice window too long/short?
- Are collisions fun or annoying?
- Is Phase Shift's 1.15-second reaction window fair?
- Are power-ups too frequent or too rare?
- Does portrait mode remain usable?
- What is the first thing a new player fails to understand?
