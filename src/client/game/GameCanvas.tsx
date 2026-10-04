import { useEffect, useRef } from "react";
import { REVEAL_WINDOW_MS } from "../../shared/constants";
import { TILE_COLORS, type GameState, type PlayerState, type TileColor } from "../../shared/types";
import { hexCorners, hexToPixel, pointInPolygon } from "./hex";
const TILE_W = 80, TILE_H = 72, PLAYER_FRAME = 32;
const PLAYER_COLORS = ["yellow", "blue", "red", "green", "pink"] as const;
const TILE_GLOW: Record<TileColor, string> = { red: "rgba(255,91,87,.34)", orange: "rgba(255,160,64,.34)", yellow: "rgba(255,220,90,.34)", green: "rgba(92,224,122,.34)", blue: "rgba(88,170,255,.34)", violet: "rgba(164,108,255,.32)" };
interface Assets {
    tiles: HTMLImageElement;
    powerups: HTMLImageElement;
    players: Record<string, HTMLImageElement>;
    ready: boolean;
}
function loadImage(src: string) { const image = new Image(); image.src = src; return image; }
function createAssets(): Assets { const tiles = loadImage("/assets/tiles/hex-atlas.png"), powerups = loadImage("/assets/powerups.png"), players: Record<string, HTMLImageElement> = {}; for (const c of PLAYER_COLORS)
    players[c] = loadImage(`/assets/characters/${c}.png`); const a = { tiles, powerups, players, ready: false }; Promise.all([tiles, powerups, ...Object.values(players)].map(img => img.decode().catch(() => undefined))).then(() => { a.ready = true; }); return a; }
function clamp01(n: number) { return Math.max(0, Math.min(1, n)); }
function lerp(a: number, b: number, t: number) { return a + (b - a) * t; }
function ease(t: number) { return t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; }
function currentPlayerPoint(player: PlayerState, now: number, centers: Map<number, {
    x: number;
    y: number;
}>) { const base = centers.get(player.tileId) ?? { x: 0, y: 0 }; if (player.movingFromTileId == null || player.movingToTileId == null || player.moveStartedAt == null || player.moveEndsAt == null)
    return base; const from = centers.get(player.movingFromTileId) ?? base, to = centers.get(player.movingToTileId) ?? base, t = clamp01((now - player.moveStartedAt) / Math.max(1, player.moveEndsAt - player.moveStartedAt)); return { x: lerp(from.x, to.x, t), y: lerp(from.y, to.y, t) }; }
function collisionPoint(player: PlayerState, state: GameState, now: number, centers: Map<number, {
    x: number;
    y: number;
}>, base: {
    x: number;
    y: number;
}) {
    if (!player.collisionUntil || !player.collisionStartedAt || player.collisionUntil <= now)
        return base;
    const t = clamp01((now - player.collisionStartedAt) / Math.max(1, player.collisionUntil - player.collisionStartedAt));
    const partner = state.players.find(p => p.id === player.collisionPartnerId);
    const partnerPt = partner ? centers.get(partner.tileId) : undefined;
    const resolve = player.collisionResolveTileId == null ? undefined : centers.get(player.collisionResolveTileId);
    const dx = partnerPt ? partnerPt.x - base.x : 0, dy = partnerPt ? partnerPt.y - base.y : 0;
    const len = Math.max(1, Math.hypot(dx, dy));
    const nx = dx / len, ny = dy / len;
    const side = player.id < (player.collisionPartnerId ?? "") ? 1 : -1;
    if (player.collisionType === "bubble") {
        if (player.collisionRole === "source")
            return { x: base.x + nx * Math.sin(t * Math.PI) * 5, y: base.y + ny * Math.sin(t * Math.PI) * 3 };
        const target = resolve ?? base;
        const k = ease(t);
        const kick = Math.sin(Math.PI * t) * (1 - t) * 15;
        return { x: lerp(base.x, target.x, k) - nx * kick, y: lerp(base.y, target.y, k) - ny * kick - 3 * Math.sin(Math.PI * t) };
    }
    if (t < .22) {
        const k = ease(t / .22);
        return { x: base.x + nx * 10 * k, y: base.y + ny * 6 * k };
    }
    if (t < .48) {
        const k = ease((t - .22) / .26);
        const recoil = player.collisionType === "head-on" ? 12 : 7;
        return { x: base.x + nx * (10 - (10 + recoil) * k) + (-ny) * side * 2 * k, y: base.y + ny * (6 - (6 + recoil * .55) * k) + nx * side * 2 * k };
    }
    const target = resolve ?? base;
    const k = ease((t - .48) / .52);
    const sideArc = (player.collisionType === "head-on" ? 16 : 9) * Math.sin(k * Math.PI) * side;
    return { x: lerp(base.x, target.x, k) + (-ny) * sideArc, y: lerp(base.y, target.y, k) + nx * sideArc * .55 };
}
function tileRow(c: TileColor) { return TILE_COLORS.indexOf(c); }
function tileState(state: GameState, color: TileColor, now: number) { if (state.selectedColor !== color)
    return { frame: 0, drop: 0, alpha: 1, hole: false }; if (state.phase === "results")
    return { frame: -1, drop: 0, alpha: 1, hole: true }; if (state.phase !== "reveal" || state.phaseEndsAt == null)
    return { frame: 2, drop: 0, alpha: 1, hole: false }; const remaining = Math.max(0, state.phaseEndsAt - now), progress = 1 - remaining / REVEAL_WINDOW_MS; if (progress < .34)
    return { frame: 2, drop: 0, alpha: 1, hole: false }; if (progress < .62)
    return { frame: 3, drop: 0, alpha: 1, hole: false }; if (progress < .86)
    return { frame: 4, drop: 0, alpha: 1, hole: false }; const d = (progress - .86) / .14; return { frame: 4, drop: d * 110, alpha: 1 - d * .72, hole: false }; }
function animationFor(player: PlayerState, state: GameState, now: number, p: {
    x: number;
    y: number;
}, centers: Map<number, {
    x: number;
    y: number;
}>) { const doomed = state.selectedColor && state.tiles.find(t => t.id === player.tileId)?.color === state.selectedColor; if (state.phase === "reveal" && doomed && state.phaseEndsAt) {
    const progress = 1 - Math.max(0, state.phaseEndsAt - now) / REVEAL_WINDOW_MS;
    if (progress > .69)
        return { row: 5, mirror: false, rate: 115 };
} if (state.phase === "game-over" && player.alive)
    return { row: 7, mirror: false, rate: 150 }; if (player.collisionUntil && player.collisionUntil > now)
    return { row: 4, mirror: false, rate: 95 }; if (player.movingToTileId != null && player.movingFromTileId != null) {
    const target = centers.get(player.movingToTileId);
    if (target) {
        const dx = target.x - p.x, dy = target.y - p.y;
        if (Math.abs(dy) < Math.abs(dx) * .45)
            return { row: 1, mirror: dx < 0, rate: 85 };
        if (dy < 0)
            return { row: 2, mirror: dx < 0, rate: 85 };
        return { row: 3, mirror: dx < 0, rate: 85 };
    }
} return { row: 0, mirror: false, rate: 260 }; }
function collisionFrame(player: PlayerState, now: number) { if (!player.collisionUntil || !player.collisionStartedAt)
    return 0; const t = clamp01((now - player.collisionStartedAt) / Math.max(1, player.collisionUntil - player.collisionStartedAt)); if (t < .2)
    return 0; if (t < .4)
    return 1; if (t < .68)
    return 2; return 3; }
function fillHex(ctx: CanvasRenderingContext2D, points: {
    x: number;
    y: number;
}[], fill: string, stroke?: string) { ctx.beginPath(); points.forEach((pt, i) => i ? ctx.lineTo(pt.x, pt.y) : ctx.moveTo(pt.x, pt.y)); ctx.closePath(); ctx.fillStyle = fill; ctx.fill(); if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 2;
    ctx.stroke();
} }
function drawBubble(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, now: number) { const pulse = 1 + Math.sin(now / 120) * .025; ctx.save(); ctx.globalAlpha = .15; ctx.fillStyle = "#8feaff"; ctx.beginPath(); ctx.arc(x, y, r * pulse, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = .9; ctx.strokeStyle = "rgba(185,244,255,.95)"; ctx.lineWidth = Math.max(2, r * .045); ctx.beginPath(); ctx.arc(x, y, r * pulse, 0, Math.PI * 2); ctx.stroke(); ctx.globalAlpha = .6; ctx.strokeStyle = "rgba(70,174,255,.85)"; ctx.lineWidth = Math.max(1, r * .025); ctx.beginPath(); ctx.arc(x + 2, y + 2, r * .88, 0, Math.PI * 2); ctx.stroke(); ctx.globalAlpha = .92; ctx.fillStyle = "#f2fdff"; ctx.fillRect(x - r * .38, y - r * .42, Math.max(3, r * .12), Math.max(3, r * .07)); ctx.globalAlpha = .6; ctx.fillRect(x + r * .31, y + r * .18, Math.max(2, r * .07), Math.max(2, r * .07)); ctx.restore(); }
export function GameCanvas({ state, myPlayerId, serverOffset, onTileClick }: {
    state: GameState;
    myPlayerId: string | null;
    serverOffset: number;
    onTileClick: (tileId: number) => void;
}) {
    const canvasRef = useRef<HTMLCanvasElement | null>(null), stateRef = useRef(state), offsetRef = useRef(serverOffset), assetsRef = useRef<Assets | null>(null);
    stateRef.current = state;
    offsetRef.current = serverOffset;
    if (!assetsRef.current)
        assetsRef.current = createAssets();
    useEffect(() => {
        const canvas = canvasRef.current!, ctx = canvas.getContext("2d")!;
        ctx.imageSmoothingEnabled = false;
        let raf = 0, hitTiles: Array<{
            id: number;
            polygon: {
                x: number;
                y: number;
            }[];
        }> = [];
        const render = () => {
            const s = stateRef.current, assets = assetsRef.current!, rect = canvas.getBoundingClientRect(), dpr = Math.min(window.devicePixelRatio || 1, 2), width = Math.max(280, rect.width), height = Math.max(220, rect.height), pxW = Math.round(width * dpr), pxH = Math.round(height * dpr);
            if (canvas.width !== pxW || canvas.height !== pxH) {
                canvas.width = pxW;
                canvas.height = pxH;
            }
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            ctx.imageSmoothingEnabled = false;
            ctx.clearRect(0, 0, width, height);
            const raw = s.tiles.map(t => hexToPixel(t, 1)), minX = Math.min(...raw.map(p => p.x)) - 1.1, maxX = Math.max(...raw.map(p => p.x)) + 1.1, minY = Math.min(...raw.map(p => p.y)) - 1.1, maxY = Math.max(...raw.map(p => p.y)) + 1.25, size = Math.max(26, Math.min((width - 24) / (maxX - minX), (height - 24) / (maxY - minY))), logical = s.tiles.map(t => hexToPixel(t, size)), lxMin = Math.min(...logical.map(p => p.x)), lxMax = Math.max(...logical.map(p => p.x)), lyMin = Math.min(...logical.map(p => p.y)), lyMax = Math.max(...logical.map(p => p.y)), ox = width / 2 - (lxMin + lxMax) / 2, oy = height / 2 - (lyMin + lyMax) / 2 - size * .06, centers = new Map<number, {
                x: number;
                y: number;
            }>(), now = Date.now() + offsetRef.current, tileScale = size / 32, drawW = TILE_W * tileScale, drawH = TILE_H * tileScale;
            hitTiles = [];
            ctx.save();
            ctx.globalAlpha = .45;
            ctx.fillStyle = "#040914";
            ctx.beginPath();
            ctx.ellipse(width / 2, height / 2 + size * 1.18, Math.min(width * .38, size * 4.2), Math.min(height * .15, size * 1.05), 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
            for (const tile of [...s.tiles].sort((a, b) => hexToPixel(a, size).y - hexToPixel(b, size).y)) {
                const rc = hexToPixel(tile, size), center = { x: rc.x + ox, y: rc.y + oy };
                centers.set(tile.id, center);
                const polygon = hexCorners(center, size * .93);
                hitTiles.push({ id: tile.id, polygon });
                const visual = tileState(s, tile.color, now);
                ctx.save();
                ctx.globalAlpha = visual.hole ? .12 : .4;
                ctx.fillStyle = TILE_GLOW[tile.color];
                ctx.beginPath();
                ctx.ellipse(center.x, center.y + size * .33, size * .46, size * .18, 0, 0, Math.PI * 2);
                ctx.fill();
                ctx.restore();
                if (visual.hole) {
                    fillHex(ctx, hexCorners({ x: center.x, y: center.y + size * .02 }, size * .76), "rgba(1,5,12,.97)", "rgba(118,132,164,.3)");
                    continue;
                }
                if (assets.ready) {
                    ctx.save();
                    ctx.globalAlpha = visual.alpha;
                    ctx.drawImage(assets.tiles, visual.frame * TILE_W, tileRow(tile.color) * TILE_H, TILE_W, TILE_H, center.x - drawW / 2, center.y - drawH * .39 + visual.drop, drawW, drawH);
                    ctx.restore();
                }
                else
                    fillHex(ctx, polygon, "#334155");
            }
            for (const power of s.powerups) {
                const c = centers.get(power.tileId);
                if (!c)
                    continue;
                const iconSize = Math.max(25, size * .6), bob = Math.sin(performance.now() / 180) * 3;
                ctx.save();
                ctx.globalAlpha = .24;
                ctx.fillStyle = power.type === "phase" ? "rgba(170,120,255,.38)" : power.type === "bubble" ? "rgba(90,215,255,.38)" : "rgba(255,215,109,.38)";
                ctx.beginPath();
                ctx.ellipse(c.x, c.y - size * .26 + bob + 15, iconSize * .38, iconSize * .16, 0, 0, Math.PI * 2);
                ctx.fill();
                ctx.restore();
                if (power.type === "bubble") {
                    drawBubble(ctx, c.x, c.y - size * .43 + bob, iconSize * .39, now);
                }
                else if (assets.ready) {
                    const icon = power.type === "phase" ? 1 : 0;
                    ctx.drawImage(assets.powerups, icon * 32, 0, 32, 32, c.x - iconSize / 2, c.y - size * .58 + bob, iconSize, iconSize);
                }
            }
            const visible = s.players.filter(player => player.alive || s.phase === "lobby" || s.phase === "game-over" || s.phase === "reveal").map(player => { const base = currentPlayerPoint(player, now, centers); return { player, point: collisionPoint(player, s, now, centers, base) }; }).sort((a, b) => a.point.y - b.point.y);
            for (const { player, point: rawPoint } of visible) {
                let point = { ...rawPoint };
                const anim = animationFor(player, s, now, point, centers), doomed = s.selectedColor && s.tiles.find(t => t.id === player.tileId)?.color === s.selectedColor;
                if (s.phase === "reveal" && doomed && s.phaseEndsAt) {
                    const progress = 1 - Math.max(0, s.phaseEndsAt - now) / REVEAL_WINDOW_MS;
                    if (progress > .83)
                        point.y += ((progress - .83) / .17) * 95;
                }
                const frame = (player.collisionUntil && player.collisionUntil > now) ? collisionFrame(player, now) : Math.floor(performance.now() / anim.rate) % 4, spriteSize = Math.max(32, size * .72), img = assets.players[player.color], bubble = (player.bubbleUntil ?? 0) > now;
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
                    ctx.ellipse(point.x, point.y + size * .16, size * .3, size * .11, 0, 0, Math.PI * 2);
                    ctx.stroke();
                    ctx.restore();
                }
                if (bubble)
                    drawBubble(ctx, point.x, point.y - spriteSize * .33, spriteSize * .64, now);
                if (assets.ready && img) {
                    ctx.save();
                    ctx.globalAlpha = player.connected ? 1 : .45;
                    ctx.translate(point.x, point.y + size * .07);
                    if (anim.mirror)
                        ctx.scale(-1, 1);
                    ctx.drawImage(img, frame * PLAYER_FRAME, anim.row * PLAYER_FRAME, PLAYER_FRAME, PLAYER_FRAME, -spriteSize / 2, -spriteSize * .88, spriteSize, spriteSize);
                    ctx.restore();
                }
                if (bubble) {
                    ctx.save();
                    ctx.globalAlpha = .75;
                    ctx.strokeStyle = "rgba(210,250,255,.9)";
                    ctx.lineWidth = 1.5;
                    ctx.beginPath();
                    ctx.arc(point.x, point.y - spriteSize * .33, spriteSize * .64, Math.PI * .1, Math.PI * .9);
                    ctx.stroke();
                    ctx.restore();
                }
                ctx.save();
                ctx.globalAlpha = player.connected ? .96 : .5;
                ctx.font = `700 ${Math.max(9, size * .18)}px ui-monospace,monospace`;
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
        const click = (event: PointerEvent) => { const rect = canvas.getBoundingClientRect(), p = { x: event.clientX - rect.left, y: event.clientY - rect.top }, hit = hitTiles.find(h => pointInPolygon(p, h.polygon)); if (hit)
            onTileClick(hit.id); };
        canvas.addEventListener("pointerdown", click);
        return () => { cancelAnimationFrame(raf); canvas.removeEventListener("pointerdown", click); };
    }, [myPlayerId, onTileClick]);
    return <canvas ref={canvasRef} className="game-canvas" aria-label="Tiles game board"/>;
}

