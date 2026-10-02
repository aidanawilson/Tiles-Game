import { useEffect, useRef } from "react";
import type { GameState, PlayerState, TileColor } from "../../shared/types";
import { hexCorners, hexToPixel, pointInPolygon } from "./hex";

const COLORS: Record<TileColor, string> = {
  red: "#ef4444",
  orange: "#f97316",
  yellow: "#eab308",
  green: "#22c55e",
  blue: "#3b82f6",
  violet: "#8b5cf6",
};

function currentPlayerPoint(player: PlayerState, state: GameState, now: number, centers: Map<number, {x:number;y:number}>) {
  const base = centers.get(player.tileId) ?? { x: 0, y: 0 };
  if (player.movingFromTileId == null || player.movingToTileId == null || !player.moveStartedAt || !player.moveEndsAt) return base;
  const from = centers.get(player.movingFromTileId) ?? base;
  const to = centers.get(player.movingToTileId) ?? base;
  const t = Math.max(0, Math.min(1, (now - player.moveStartedAt) / (player.moveEndsAt - player.moveStartedAt)));
  const eased = t * t * (3 - 2 * t);
  return { x: from.x + (to.x - from.x) * eased, y: from.y + (to.y - from.y) * eased };
}

export function GameCanvas({ state, myPlayerId, onTileClick }: { state: GameState; myPlayerId: string | null; onTileClick: (tileId: number) => void }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    let raf = 0;
    let hitTiles: Array<{ id: number; polygon: {x:number;y:number}[] }> = [];

    const render = () => {
      const s = stateRef.current;
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const width = Math.max(320, rect.width);
      const height = Math.max(300, rect.height);
      if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
        canvas.width = Math.round(width * dpr);
        canvas.height = Math.round(height * dpr);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);

      const raw = s.tiles.map((t) => hexToPixel(t, 1));
      const minX = Math.min(...raw.map((p) => p.x)) - 1;
      const maxX = Math.max(...raw.map((p) => p.x)) + 1;
      const minY = Math.min(...raw.map((p) => p.y)) - 1;
      const maxY = Math.max(...raw.map((p) => p.y)) + 1;
      const scale = Math.min((width - 36) / (maxX - minX), (height - 36) / (maxY - minY));
      const size = Math.max(22, scale);
      const centers = new Map<number, {x:number;y:number}>();
      const logical = s.tiles.map((t) => hexToPixel(t, size));
      const lxMin = Math.min(...logical.map((p) => p.x));
      const lxMax = Math.max(...logical.map((p) => p.x));
      const lyMin = Math.min(...logical.map((p) => p.y));
      const lyMax = Math.max(...logical.map((p) => p.y));
      const ox = width / 2 - (lxMin + lxMax) / 2;
      const oy = height / 2 - (lyMin + lyMax) / 2;

      hitTiles = [];
      const pulse = (Math.sin(performance.now() / 90) + 1) / 2;
      for (const tile of s.tiles) {
        const rawCenter = hexToPixel(tile, size);
        const center = { x: rawCenter.x + ox, y: rawCenter.y + oy };
        centers.set(tile.id, center);
        const polygon = hexCorners(center, size * 0.95);
        hitTiles.push({ id: tile.id, polygon });
        ctx.beginPath();
        polygon.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y));
        ctx.closePath();
        const isDoomed = s.selectedColor === tile.color;
        const hasDropped = s.phase === "results" && isDoomed;
        if (hasDropped) {
          ctx.globalAlpha = 0.16;
          ctx.fillStyle = "#020617";
          ctx.fill();
          ctx.globalAlpha = 1;
          ctx.lineWidth = 1;
          ctx.strokeStyle = "rgba(71,85,105,.25)";
          ctx.stroke();
          continue;
        }
        const isFlickering = s.phase === "reveal" && isDoomed;
        ctx.globalAlpha = isFlickering ? 0.25 + 0.75 * pulse : 1;
        ctx.fillStyle = COLORS[tile.color];
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.lineWidth = 2;
        ctx.strokeStyle = "rgba(15,23,42,.55)";
        ctx.stroke();
      }

      for (const power of s.powerups) {
        const c = centers.get(power.tileId);
        if (!c) continue;
        ctx.save();
        ctx.translate(c.x, c.y - 4 - Math.sin(performance.now() / 220) * 3);
        ctx.fillStyle = "rgba(255,255,255,.92)";
        ctx.beginPath(); ctx.arc(0, 0, size * .23, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = "#111827";
        ctx.font = `700 ${Math.max(12, size * .28)}px system-ui`;
        ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.fillText(power.type === "phase" ? "P" : "S", 0, 1);
        ctx.restore();
      }

      const now = Date.now();
      for (const player of s.players) {
        if (!player.alive && s.phase !== "lobby" && s.phase !== "game-over") continue;
        let p = currentPlayerPoint(player, s, now, centers);
        if (player.collisionUntil && player.collisionUntil > now) {
          const remaining = player.collisionUntil - now;
          const amp = player.collisionType === "head-on" ? 8 : 4;
          p = { x: p.x + Math.sin(remaining / 35) * amp, y: p.y };
        }
        const radius = Math.max(10, size * .25);
        ctx.save();
        ctx.globalAlpha = player.connected ? 1 : .45;
        ctx.fillStyle = "#070b12";
        ctx.beginPath(); ctx.arc(p.x, p.y, radius, 0, Math.PI * 2); ctx.fill();
        if (player.id === myPlayerId) {
          ctx.strokeStyle = "white"; ctx.lineWidth = 3; ctx.stroke();
        }
        ctx.fillStyle = "white";
        ctx.font = `700 ${Math.max(10, size * .19)}px system-ui`;
        ctx.textAlign = "center"; ctx.textBaseline = "bottom";
        ctx.fillText(player.name, p.x, p.y - radius - 5);
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
    return () => { cancelAnimationFrame(raf); canvas.removeEventListener("pointerdown", click); };
  }, [myPlayerId, onTileClick]);

  return <canvas ref={canvasRef} className="game-canvas" aria-label="Tiles game board" />;
}
