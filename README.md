# Tiles V0.3 — Arcade Overhaul

A realtime 2–5 player browser party game by Apogee Lab.

## What changed in V0.3

- Retro arcade visual overhaul matching the approved mockups.
- Sprite-atlas characters in five non-repeating player colors: yellow, blue, red, green, pink.
- Modular 3D hex-tile atlas with normal/selected/cracked/breaking/hole states.
- Smooth client-side movement interpolation while the Durable Object stays authoritative.
- Code-driven selector wheel that automatically adapts to the living/eligible players.
- Large selector color-drop popup without duplicating the Tiles logo.
- One-slot power-up HUD.
- Looping licensed arcade background music with persistent mute control.
- iOS/Home Screen reconnect identity now uses persistent localStorage instead of sessionStorage.
- Optional reconnect-to-last-room button on the landing page.
- Mobile tutorial text is touch-aware and the tutorial is safe-area/short-landscape friendly.
- Worker name aligned to `tiles-game` to remove the prior CI naming warning.

## Architecture

- React + TypeScript + Vite frontend.
- Canvas renderer for the arena and sprite animation.
- Cloudflare Worker for HTTP routing/static application deployment.
- One Durable Object per room for authoritative realtime game state.
- WebSockets for room synchronization.
- No D1 required for V0.3.

## Cloudflare build settings

Use the same settings that succeeded for V0.2:

- Build command: `npm run build`
- Deploy command: `npx wrangler deploy`

Cloudflare may choose Bun automatically for dependency installation; that is okay.

## Local commands

```bash
npm install
npm run check
npm run dev
```

## Runtime assets

Production-ready runtime assets live in `public/assets/`.

The approved concept/mockup sheets are also retained in `art-reference/` so the visual design process remains documented. The runtime character/tile atlases are clean transparent assets derived to match that approved visual language rather than attempting to crop labels/backgrounds from the presentation sheets at runtime.

## Music

The supplied track is stored at:

`public/audio/retro-arcade-theme.mp3`

License evidence supplied with the project is retained at:

`licenses/retro-arcade-theme-license.png`
