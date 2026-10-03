import { useEffect, useRef } from "react";
import { REVEAL_WINDOW_MS } from "../../shared/constants";
import { TILE_COLORS, type GameState, type PlayerState, type TileColor } from "../../shared/types";
import { hexCorners, hexToPixel, pointInPolygon } from "./hex";

const TILE_W = 80;
const TILE_H = 72;
const PLAYER_FRAME = 32;
const PLAYER_COLORS = ["yellow", "blue", "red", "green", "pink"] as const;
const TILE_GLOW: Record<TileColor, string> = {
  red: "rgba(255,91,87,0.34)",
  orange: "rgba(255,160,64,0.34)",
  yellow: "rgba(255,220,90,0.34)",
  green: "rgba(92,224,122,0.34)",
  blue: "rgba(88,170,255,0.34)",
  violet: "rgba(164,108,255,0.32)",
};

interface Assets {
  tiles: HTMLImageElement;
  powerups: HTMLImageElement;
  players: Record<string, HTMLImageElement>;
  ready: boolean;
}

function loadImage(src: string): HTMLImageElement {
  const image = new Image();
  image.src = src;
  return image;
}

function createAssets(): Assets {
  const tiles = loadImage("/assets/tiles/hex-atlas.png");
  const powerups = loadImage("/assets/powerups.png");
  const players: Record<string, HTMLImageElement> = {};
  for (const color of PLAYER_COLORS) players[color] = loadImage(`/assets/characters/${color}.png`);
  const assets: Assets = { tiles, powerups, players, ready: false };
  const all = [tiles, powerups, ...Object.values(players)];
  Promise.all(all.map((img) => img.decode().catch(() => undefined))).then(() => { assets.ready = true; });
  return assets;
}

function currentPlayerPoint(player: PlayerState, now: number, centers: Map<number, { x: number; y: number }>) {
  const base = centers.get(player.tileId) ?? { x: 0, y: 0 };
  if (player.movingFromTileId == null || player.movingToTileId == null || player.moveStartedAt == null || player.moveEndsAt == null) return base;
  const from = centers.get(player.movingFromTileId) ?? base;
  const to = centers.get(player.movingToTileId) ?? base;
  const duration = Math.max(1, player.moveEndsAt - player.moveStartedAt);
  const t = Math.max(0, Math.min(1, (now - player.moveStartedAt) / duration));
  return { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t };
}

function tileRow(color: TileColor) {
  return TILE_COLORS.indexOf(color);
}

function tileState(state: GameState, color: TileColor, now: number): { frame: number; drop: number; alpha: number; hole: boolean } {
  if (state.selectedColor !== color) return { frame: 0, drop: 0, alpha: 1, hole: false };
  if (state.phase === "results") return { frame: -1, drop: 0, alpha: 1, hole: true };
  if (state.phase !== "reveal" || state.phaseEndsAt == null) return { frame: 2, drop: 0, alpha: 1, hole: false };
  const remaining = Math.max(0, state.phaseEndsAt - now);
  const progress = 1 - remaining / REVEAL_WINDOW_MS;
  if (progress < .34) return { frame: 2, drop: 0, alpha: 1, hole: false };
  if (progress < .62) return { frame: 3, drop: 0, alpha: 1, hole: false };
  if (progress < .86) return { frame: 4, drop: 0, alpha: 1, hole: false };
  const d = (progress - .86) / .14;
  return { frame: 4, drop: d * 95, alpha: 1 - d * .45, hole: false };
}

function animationFor(player: PlayerState, state: GameState, now: number, p: { x: number; y: number }, centers: Map<number, { x: number; y: number }>) {
  const doomed = state.selectedColor && state.tiles.find((t) => t.id === player.tileId)?.color === state.selectedColor;
  if (state.phase === "reveal" && doomed && state.phaseEndsAt) {
    const progress = 1 - Math.max(0, state.phaseEndsAt - now) / REVEAL_WINDOW_MS;
    if (progress > .69) return { row: 5, mirror: false, rate: 115 };
  }
  if (state.phase === "game-over" && player.alive) return { row: 7, mirror: false, rate: 150 };
  if (player.collisionUntil && player.collisionUntil > now) return { row: 4, mirror: false, rate: 95 };
  if (player.movingToTileId != null && player.movingFromTileId != null) {
    const target = centers.get(player.movingToTileId);
    if (target) {
      const dx = target.x - p.x;
      const dy = target.y - p.y;
      if (Math.abs(dy) < Math.abs(dx) * .45) return { row: 1, mirror: dx < 0, rate: 85 };
      if (dy < 0) return { row: 2, mirror: dx < 0, rate: 85 };
      return { row: 3, mirror: dx < 0, rate: 85 };
    }
  }
  return { row: 0, mirror: false, rate: 260 };
}

function fillHex(ctx: CanvasRenderingContext2D, points: { x: number; y: number }[], fill: string, stroke?: string) {
  ctx.beginPath();
  points.forEach((pt, i) => (i ? ctx.lineTo(pt.x, pt.y) : ctx.moveTo(pt.x, pt.y)));
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 2;
    ctx.stroke();
  }
}

export function GameCanvas({
  state,
  myPlayerId,
  serverOffset,
  onTileClick,
}: {
  state: GameState;
  myPlayerId: string | null;
  serverOffset: number;
  onTileClick: (tileId: number) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const stateRef = useRef(state);
  const offsetRef = useRef(serverOffset);
  const assetsRef = useRef<Assets | null>(null);
  stateRef.current = state;
  offsetRef.current = serverOffset;
  if (!assetsRef.current) assetsRef.current = createAssets();

  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    ctx.imageSmoothingEnabled = false;
    let raf = 0;
    let hitTiles: Array<{ id: number; polygon: { x: number; y: number }[] }> = [];

    const render = () => {
      const s = stateRef.current;
      const assets = assetsRef.current!;
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const width = Math.max(300, rect.width);
      const height = Math.max(250, rect.height);
      const pxW = Math.round(width * dpr), pxH = Math.round(height * dpr);
      if (canvas.width !== pxW || canvas.height !== pxH) {
        canvas.width = pxW;
        canvas.height = pxH;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.imageSmoothingEnabled = false;
      ctx.clearRect(0, 0, width, height);

      const raw = s.tiles.map((t) => hexToPixel(t, 1));
      const minX = Math.min(...raw.map((p) => p.x)) - 1.1;
      const maxX = Math.max(...raw.map((p) => p.x)) + 1.1;
      const minY = Math.min(...raw.map((p) => p.y)) - 1.1;
      const maxY = Math.max(...raw.map((p) => p.y)) + 1.25;
      const size = Math.max(30, Math.min((width - 30) / (maxX - minX), (height - 30) / (maxY - minY)));
      const logical = s.tiles.map((t) => hexToPixel(t, size));
      const lxMin = Math.min(...logical.map((p) => p.x));
      const lxMax = Math.max(...logical.map((p) => p.x));
      const lyMin = Math.min(...logical.map((p) => p.y));
      const lyMax = Math.max(...logical.map((p) => p.y));
      const ox = width / 2 - (lxMin + lxMax) / 2;
      const oy = height / 2 - (lyMin + lyMax) / 2 - size * .06;
      const centers = new Map<number, { x: number; y: number }>();
      const now = Date.now() + offsetRef.current;
      const tileScale = size / 32;
      const drawW = TILE_W * tileScale;
      const drawH = TILE_H * tileScale;

      hitTiles = [];
      ctx.save();
      ctx.globalAlpha = .45;
      ctx.fillStyle = "#040914";
      ctx.beginPath();
      ctx.ellipse(width / 2, height / 2 + size * 1.18, Math.min(width * .38, size * 4.2), Math.min(height * .15, size * 1.05), 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      const sortedTiles = [...s.tiles].sort((a, b) => hexToPixel(a, size).y - hexToPixel(b, size).y);
      for (const tile of sortedTiles) {
        const rawCenter = hexToPixel(tile, size);
        const center = { x: rawCenter.x + ox, y: rawCenter.y + oy };
        centers.set(tile.id, center);
        const polygon = hexCorners(center, size * .93);
        hitTiles.push({ id: tile.id, polygon });
        const visual = tileState(s, tile.color, now);

        ctx.save();
        ctx.globalAlpha = visual.hole ? .15 : .42;
        ctx.fillStyle = TILE_GLOW[tile.color];
        ctx.beginPath();
        ctx.ellipse(center.x, center.y + size * .33, size * .46, size * .18, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        if (visual.hole) {
          const holePoly = hexCorners({ x: center.x, y: center.y + size * .02 }, size * .76);
          ctx.save();
          fillHex(ctx, holePoly, "rgba(1,5,12,.96)", "rgba(118,132,164,.35)");
          ctx.restore();
          continue;
        }

        if (assets.ready) {
          ctx.save();
          ctx.globalAlpha = visual.alpha;
          ctx.drawImage(
            assets.tiles,
            visual.frame * TILE_W,
            tileRow(tile.color) * TILE_H,
            TILE_W,
            TILE_H,
            center.x - drawW / 2,
            center.y - drawH * .39 + visual.drop,
            drawW,
            drawH,
          );
          ctx.restore();
        } else {
          fillHex(ctx, polygon, "#334155");
        }
      }

      for (const power of s.powerups) {
        const c = centers.get(power.tileId);
        if (!c) continue;
        const icon = power.type === "phase" ? 1 : 0;
        const iconSize = Math.max(26, size * .62);
        const bob = Math.sin(performance.now() / 180) * 3;
        ctx.save();
        ctx.globalAlpha = .25;
        ctx.fillStyle = power.type === "phase" ? "rgba(170,120,255,.38)" : "rgba(255,215,109,.38)";
        ctx.beginPath();
        ctx.ellipse(c.x, c.y - size * .26 + bob + 15, iconSize * .38, iconSize * .16, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        if (assets.ready) ctx.drawImage(assets.powerups, icon * 32, 0, 32, 32, c.x - iconSize / 2, c.y - size * .58 + bob, iconSize, iconSize);
      }

      const visiblePlayers = s.players
        .filter((player) => player.alive || s.phase === "lobby" || s.phase === "game-over" || s.phase === "reveal")
        .map((player) => ({ player, point: currentPlayerPoint(player, now, centers) }))
        .sort((a, b) => a.point.y - b.point.y);

      for (const { player, point: basePoint } of visiblePlayers) {
        let point = { ...basePoint };
        const anim = animationFor(player, s, now, point, centers);
        if (player.collisionUntil && player.collisionUntil > now) {
          const remain = player.collisionUntil - now;
          point.x += Math.sin(remain / 28) * (player.collisionType === "head-on" ? 8 : 4);
        }
        const doomed = s.selectedColor && s.tiles.find((t) => t.id === player.tileId)?.color === s.selectedColor;
        if (s.phase === "reveal" && doomed && s.phaseEndsAt) {
          const progress = 1 - Math.max(0, s.phaseEndsAt - now) / REVEAL_WINDOW_MS;
          if (progress > .83) point.y += ((progress - .83) / .17) * 90;
        }
        const frame = Math.floor(performance.now() / anim.rate) % 4;
        const spriteSize = Math.max(34, size * .72);
        const img = assets.players[player.color];

        ctx.save();
        ctx.globalAlpha = player.connected ? .42 : .18;
        ctx.fillStyle = "rgba(7,10,18,.95)";
        ctx.beginPath();
        ctx.ellipse(point.x, point.y + size * .18, size * .26, size * .09, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        if (player.id === myPlayerId && player.alive) {
          ctx.save();
          ctx.globalAlpha = .82;
          ctx.strokeStyle = "#fff0a8";
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.ellipse(point.x, point.y + size * .16, size * .30, size * .11, 0, 0, Math.PI * 2);
          ctx.stroke();
          ctx.restore();
        }

        if (assets.ready && img) {
          ctx.save();
          ctx.globalAlpha = player.connected ? 1 : .45;
          ctx.translate(point.x, point.y + size * .07);
          if (anim.mirror) ctx.scale(-1, 1);
          ctx.drawImage(img, frame * PLAYER_FRAME, anim.row * PLAYER_FRAME, PLAYER_FRAME, PLAYER_FRAME, -spriteSize / 2, -spriteSize * .88, spriteSize, spriteSize);
          ctx.restore();
        }

        ctx.save();
        ctx.globalAlpha = player.connected ? .96 : .5;
        ctx.font = `700 ${Math.max(10, size * .18)}px ui-monospace, monospace`;
        ctx.textAlign = "center";
        ctx.textBaseline = "bottom";
        ctx.lineWidth = 3;
        ctx.strokeStyle = "rgba(3,6,14,.9)";
        ctx.strokeText(player.name, point.x, point.y - spriteSize * .82);
        ctx.fillStyle = "#f8fafc";
        ctx.fillText(player.name, point.x, point.y - spriteSize * .82);
        ctx.restore();
      }

      raf = requestAnimationFrame(render);
    };
    render();

    const click = (event: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      const p = { x: event.clientX - rect.left, y: event.clientY - rect.top };
      const hit = hitTiles.find((h) => pointInPolygon(p, h.polygon));
      if (hit) onTileClick(hit.id);
    };
    canvas.addEventListener("pointerdown", click);
    return () => {
      cancelAnimationFrame(raf);
      canvas.removeEventListener("pointerdown", click);
    };
  }, [myPlayerId, onTileClick]);

  return <canvas ref={canvasRef} className="game-canvas" aria-label="Tiles game board" />;
}
