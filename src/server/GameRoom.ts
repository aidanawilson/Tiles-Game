import { DurableObject } from "cloudflare:workers";
import { BASE_STEP_MS, BOARD_RADIUS, BOT_READY_MAX_MS, BOT_READY_MIN_MS, BOT_SELECTOR_MAX_MS, BOT_SELECTOR_MIN_MS, BUBBLE_COLLISION_MS, BUBBLE_DURATION_MS, COLLISION_COMMIT_MS, COLLISION_PAIR_COOLDOWN_MS, GLANCING_COLLISION_MS, HEAD_ON_COLLISION_MS, MAX_PLAYERS, MIN_PLAYERS, MOVEMENT_PHASE_MS, PUBLIC_FIRST_BOT_DELAY_MS, PUBLIC_NEXT_BOT_MAX_MS, PUBLIC_NEXT_BOT_MIN_MS, RECONNECT_GRACE_MS, RESULTS_MS, REVEAL_WINDOW_MS, SELECTOR_CHOICE_MS, SELECTOR_WHEEL_MS, SPEED_DURATION_MS, SPEED_STEP_MS, START_COUNTDOWN_MS, } from "../shared/constants";
import { encodeServerMessage, parseClientMessage } from "../shared/messages";
import { PLAYER_COLORS, TILE_COLORS, type ClientMessage, type CollisionRole, type GameState, type HexTile, type PlayerState, type PowerupState, type PowerupType, type RoomVisibility, type TileColor, } from "../shared/types";
interface Env {
}
interface SocketAttachment {
    playerId: string;
}
interface StoredRoom {
    created: boolean;
    state: GameState;
    reconnectTokens: Record<string, string>;
    disconnectedAt: Record<string, number>;
    botPlayerIds: string[];
    nextBotAt?: number | null;
}
const STORAGE_KEY = "room";
const BOT_PREFIX = ["Nova", "Pixel", "Orbit", "Echo", "Drift", "Neon", "Turbo", "Astro", "Lunar", "Vapor", "Solar", "Kilo", "Mango", "Comet", "Vector", "Rocket", "Hyper", "Static", "Cloud", "Arcade"];
const BOT_SUFFIX = ["Fox", "Byte", "Jet", "Dash", "Wave", "Bolt", "Cat", "Rider", "Loop", "Nine"];
const BOT_NAMES = BOT_PREFIX.flatMap((a) => BOT_SUFFIX.map((b) => `${a}${b}`));
function id(prefix = "id") { return `${prefix}_${crypto.randomUUID().replaceAll("-", "").slice(0, 12)}`; }
function randInt(max: number) { const b = new Uint32Array(1); crypto.getRandomValues(b); return max <= 1 ? 0 : b[0] % max; }
function randBetween(min: number, max: number) { return min + randInt(Math.max(1, max - min + 1)); }
function shuffled<T>(items: T[]) { const a = [...items]; for (let i = a.length - 1; i > 0; i--) {
    const j = randInt(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
} return a; }
function pairKey(a: string, b: string) { return a < b ? `${a}|${b}` : `${b}|${a}`; }
function makeHexes(radius: number): HexTile[] {
    const tiles: HexTile[] = [];
    let n = 0;
    for (let q = -radius; q <= radius; q++) {
        const r1 = Math.max(-radius, -q - radius), r2 = Math.min(radius, -q + radius);
        for (let r = r1; r <= r2; r++)
            tiles.push({ id: n++, q, r, color: "red" });
    }
    return tiles;
}
function assignRandomColors(tiles: HexTile[]) {
    const counts = new Map<TileColor, number>();
    const bag: TileColor[] = [];
    for (const c of TILE_COLORS) {
        counts.set(c, 2);
        bag.push(c, c);
    }
    while (bag.length < tiles.length) {
        const e = TILE_COLORS.filter(c => (counts.get(c) ?? 0) < 5);
        const c = e[randInt(e.length)];
        counts.set(c, (counts.get(c) ?? 0) + 1);
        bag.push(c);
    }
    const colors = shuffled(bag);
    return tiles.map((t, i) => ({ ...t, color: colors[i] }));
}
function neighbors(tile: HexTile, tiles: HexTile[]) {
    const dirs = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];
    const by = new Map(tiles.map(t => [`${t.q},${t.r}`, t]));
    return dirs.map(([dq, dr]) => by.get(`${tile.q + dq},${tile.r + dr}`)).filter(Boolean) as HexTile[];
}
function hexDistance(a: HexTile, b: HexTile) { const as = -a.q - a.r, bs = -b.q - b.r; return Math.max(Math.abs(a.q - b.q), Math.abs(a.r - b.r), Math.abs(as - bs)); }
function pathfind(tiles: HexTile[], startId: number, goalId: number, blocked: Set<number>) {
    if (startId === goalId)
        return [];
    const start = tiles.find(t => t.id === startId), goal = tiles.find(t => t.id === goalId);
    if (!start || !goal || blocked.has(goalId))
        return [];
    const q = [start];
    const came = new Map<number, number | null>([[start.id, null]]);
    while (q.length) {
        const cur = q.shift()!;
        if (cur.id === goal.id)
            break;
        for (const nx of neighbors(cur, tiles)) {
            if (blocked.has(nx.id) || came.has(nx.id))
                continue;
            came.set(nx.id, cur.id);
            q.push(nx);
        }
    }
    if (!came.has(goal.id))
        return [];
    const out: number[] = [];
    let c: number | null = goal.id;
    while (c !== null && c !== start.id) {
        out.unshift(c);
        c = came.get(c) ?? null;
    }
    return out;
}
function emptyState(roomCode: string, visibility: RoomVisibility = "private", botsEnabled = false, quickPlay = false): GameState {
    return { roomCode, room: { visibility, botsEnabled, quickPlay, rosterLocked: false, startCommitted: false }, phase: "lobby", round: 0, tiles: assignRandomColors(makeHexes(BOARD_RADIUS)), players: [], powerups: [], selectorId: null, selectorCandidates: [], selectedColor: null, phaseEndsAt: null, message: "Waiting for players", fairness: { cycleCounts: {}, doubledPlayers: [] } };
}
function blankMotion(p: PlayerState) { p.destinationTileId = null; p.path = []; p.movingFromTileId = null; p.movingToTileId = null; p.moveStartedAt = null; p.moveEndsAt = null; }
function blankCollision(p: PlayerState) { p.collisionUntil = null; p.collisionStartedAt = null; p.collisionType = null; p.collisionEventId = null; p.collisionPartnerId = null; p.collisionResolveTileId = null; p.collisionRole = null; }
export class GameRoom extends DurableObject<Env> {
    private roomCode = "";
    private created = false;
    private state: GameState = emptyState("");
    private reconnectTokens: Record<string, string> = {};
    private disconnectedAt: Record<string, number> = {};
    private botPlayerIds = new Set<string>();
    private phaseTimer: ReturnType<typeof setTimeout> | null = null;
    private movementTimer: ReturnType<typeof setInterval> | null = null;
    private lastTick = Date.now();
    private botFillTimer: ReturnType<typeof setTimeout> | null = null;
    private nextBotAt: number | null = null;
    private botTimers = new Set<ReturnType<typeof setTimeout>>();
    private pairCooldowns = new Map<string, number>();
    constructor(ctx: DurableObjectState, env: Env) {
        super(ctx, env);
        this.ctx.blockConcurrencyWhile(async () => {
            const stored = await this.ctx.storage.get<StoredRoom>(STORAGE_KEY);
            if (!stored)
                return;
            this.created = stored.created;
            this.state = stored.state;
            this.roomCode = this.state.roomCode;
            this.reconnectTokens = stored.reconnectTokens ?? {};
            this.disconnectedAt = stored.disconnectedAt ?? {};
            this.botPlayerIds = new Set(stored.botPlayerIds ?? []);
            this.nextBotAt = stored.nextBotAt ?? null;
            this.state.room ??= { visibility: "private", botsEnabled: false, quickPlay: false, rosterLocked: false, startCommitted: false };
            this.state.selectorCandidates ??= [];
            const connectedIds = new Set(this.ctx.getWebSockets().map(s => s.deserializeAttachment() as SocketAttachment | null).filter(Boolean).map(a => a!.playerId));
            for (const p of this.state.players) {
                p.connected = this.botPlayerIds.has(p.id) || connectedIds.has(p.id);
                p.bubbleUntil ??= null;
                p.collisionStartedAt ??= null;
                p.collisionEventId ??= null;
                p.collisionPartnerId ??= null;
                p.collisionResolveTileId ??= null;
                p.collisionRole ??= null;
            }
            // A committed lobby countdown can safely resume from its persisted deadline.
            if (this.state.phase === "countdown" && this.state.phaseEndsAt) {
                const left = this.state.phaseEndsAt - Date.now();
                if (left <= 0)
                    this.startCommittedMatch();
                else
                    this.schedulePhase(left, () => this.startCommittedMatch());
            }
            else if (!["lobby", "game-over"].includes(this.state.phase)) {
                for (const p of this.state.players) {
                    p.ready = false;
                    p.alive = true;
                    blankMotion(p);
                    blankCollision(p);
                }
                this.state.phase = "lobby";
                this.state.phaseEndsAt = null;
                this.state.room.rosterLocked = false;
                this.state.room.startCommitted = false;
                this.state.message = "Match reset after server restart";
            }
            if (this.state.phase === "lobby" && this.state.room.botsEnabled && this.humanPlayers().length)
                this.scheduleBotFill(this.nextBotAt ? Math.max(0, this.nextBotAt - Date.now()) : PUBLIC_FIRST_BOT_DELAY_MS);
            await this.persist();
        });
    }
    async fetch(request: Request) {
        const url = new URL(request.url);
        if (url.pathname === "/create" && request.method === "POST") {
            if (this.created)
                return new Response("exists", { status: 409 });
            this.roomCode = (url.searchParams.get("code") || "").toUpperCase();
            const visibility = (url.searchParams.get("visibility") === "public" ? "public" : "private") as RoomVisibility;
            const bots = url.searchParams.get("bots") === "1";
            const quick = url.searchParams.get("quick") === "1";
            this.created = true;
            this.state = emptyState(this.roomCode, visibility, bots, quick);
            await this.persist();
            return new Response("created", { status: 201 });
        }
        if (url.pathname === "/status" && request.method === "GET") {
            if (!this.created)
                return Response.json({ exists: false }, { status: 404 });
            const botCount = this.botPlayerIds.size;
            return Response.json({ exists: true, roomCode: this.roomCode, phase: this.state.phase, players: this.state.players.length, maxPlayers: MAX_PLAYERS, visibility: this.state.room.visibility, botsEnabled: this.state.room.botsEnabled, matchmakingOpen: this.state.room.visibility === "public" && !this.state.room.rosterLocked && ["lobby", "countdown", "game-over"].includes(this.state.phase) && (this.state.players.length < MAX_PLAYERS || botCount > 0) });
        }
        if (url.pathname === "/ws") {
            if (!this.created)
                return new Response("Room not found", { status: 404 });
            if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket")
                return new Response("Expected websocket", { status: 426 });
            const pair = new WebSocketPair();
            const [client, server] = Object.values(pair);
            this.ctx.acceptWebSocket(server);
            return new Response(null, { status: 101, webSocket: client });
        }
        return new Response("Not found", { status: 404 });
    }
    async webSocketMessage(ws: WebSocket, raw: ArrayBuffer | string) {
        const text = typeof raw === "string" ? raw : new TextDecoder().decode(raw);
        if (text.length > 1024)
            return this.sendError(ws, "Message too large");
        const m = parseClientMessage(text);
        if (!m)
            return this.sendError(ws, "Invalid message");
        const at = ws.deserializeAttachment() as SocketAttachment | null;
        if (m.type === "hello") {
            await this.handleHello(ws, m);
            return;
        }
        if (!at?.playerId)
            return this.sendError(ws, "Join the room first");
        const p = this.state.players.find(x => x.id === at.playerId);
        if (!p)
            return this.sendError(ws, "Player not found");
        switch (m.type) {
            case "ready":
                if (["lobby", "game-over"].includes(this.state.phase) && !this.state.room.startCommitted) {
                    p.ready = m.ready;
                    this.evaluateLobbyStart();
                }
                break;
            case "start-game":
                if (p.host)
                    this.commitStart(false);
                break;
            case "move":
                this.requestMove(p, m.tileId);
                break;
            case "choose-color":
                this.chooseColor(p, m.color);
                break;
            case "use-powerup":
                this.usePowerup(p);
                break;
            case "leave-room":
                await this.leavePlayer(p.id);
                try {
                    ws.close(1000, "Player left room");
                }
                catch { }
                return;
            case "ping":
                ws.send(encodeServerMessage({ type: "pong", clientTime: m.clientTime, serverTime: Date.now() }));
                return;
        }
        await this.persist();
        this.broadcastState();
    }
    async webSocketClose(ws: WebSocket) { const at = ws.deserializeAttachment() as SocketAttachment | null; if (!at?.playerId || this.botPlayerIds.has(at.playerId) || this.hasAnotherSocketForPlayer(at.playerId, ws))
        return; const p = this.state.players.find(x => x.id === at.playerId); if (p) {
        p.connected = false;
        this.disconnectedAt[p.id] = Date.now();
        if (p.host)
            this.transferHost();
        await this.persist();
        await this.scheduleDisconnectAlarm();
        this.broadcastState();
    } }
    webSocketError(ws: WebSocket) { try {
        ws.close(1011, "Socket error");
    }
    catch { } }
    async alarm() { await this.removeExpiredDisconnected(); await this.scheduleDisconnectAlarm(); }
    private humanPlayers() { return this.state.players.filter(p => !this.botPlayerIds.has(p.id)); }
    private botPlayers() { return this.state.players.filter(p => this.botPlayerIds.has(p.id)); }
    private connectedHumans() { return this.humanPlayers().filter(p => p.connected); }
    private humanReadyRequired() { const n = this.connectedHumans().length; if (n <= 0)
        return Infinity; if (n === 1)
        return 1; return Math.floor(n / 2) + 1; }
    private humanReadyCount() { return this.connectedHumans().filter(p => p.ready).length; }
    private async handleHello(ws: WebSocket, m: Extract<ClientMessage, {
        type: "hello";
    }>) {
        await this.removeExpiredDisconnected(false);
        const clean = m.name.trim().slice(0, 16) || "Player";
        let p: PlayerState | undefined;
        if (m.playerId && m.reconnectToken && this.reconnectTokens[m.playerId] === m.reconnectToken)
            p = this.state.players.find(x => x.id === m.playerId && !this.botPlayerIds.has(x.id));
        if (!p) {
            const replaceable = this.state.room.rosterLocked ? undefined : this.botPlayers().at(-1);
            const joinablePhase = this.state.phase === "lobby" || this.state.phase === "game-over" || this.state.phase === "countdown";
            if (!joinablePhase) {
                this.rejectSocket(ws, "A match is already in progress");
                return;
            }
            if (this.state.players.length >= MAX_PLAYERS && !replaceable) {
                this.rejectSocket(ws, "This room is full");
                return;
            }
            let color;
            let tile;
            let host = false;
            if (replaceable) {
                color = replaceable.color;
                tile = replaceable.tileId;
                host = replaceable.host || this.humanPlayers().length === 0;
                this.removeBot(replaceable.id, false);
            }
            else {
                const used = new Set(this.state.players.map(x => x.color));
                color = PLAYER_COLORS.find(c => !used.has(c)) ?? PLAYER_COLORS[this.state.players.length % PLAYER_COLORS.length];
                tile = this.pickSpawnTile(new Set(this.state.players.map(x => x.tileId)));
                host = this.humanPlayers().length === 0;
            }
            const playerId = id("p"), token = crypto.randomUUID();
            p = this.newPlayer(playerId, clean, color, tile, host);
            this.state.players.push(p);
            this.reconnectTokens[playerId] = token;
            this.ensureBotNamesUnique();
            if (this.state.room.botsEnabled && !this.state.room.rosterLocked)
                this.scheduleBotFill(PUBLIC_FIRST_BOT_DELAY_MS);
            this.evaluateLobbyStart();
        }
        else {
            p.connected = true;
            p.name = clean;
            delete this.disconnectedAt[p.id];
            await this.scheduleDisconnectAlarm();
        }
        ws.serializeAttachment({ playerId: p.id } satisfies SocketAttachment);
        this.closeDuplicateSockets(p.id, ws);
        await this.persist();
        ws.send(encodeServerMessage({ type: "welcome", playerId: p.id, reconnectToken: this.reconnectTokens[p.id], state: this.publicState(), serverTime: Date.now() }));
        this.broadcastState();
    }
    private newPlayer(playerId: string, name: string, color: PlayerState["color"], tileId: number, host = false): PlayerState { return { id: playerId, name, color, tileId, alive: true, connected: true, ready: false, wins: 0, host, destinationTileId: null, path: [], movingFromTileId: null, movingToTileId: null, moveStartedAt: null, moveEndsAt: null, collisionUntil: null, collisionStartedAt: null, collisionType: null, collisionEventId: null, collisionPartnerId: null, collisionResolveTileId: null, collisionRole: null, powerup: null, speedBoostUntil: null, bubbleUntil: null }; }
    private ensureBotNamesUnique() { const usedHumans = new Set(this.humanPlayers().map(p => p.name.toLowerCase())); const used = new Set(usedHumans); for (const bot of this.botPlayers()) {
        if (!used.has(bot.name.toLowerCase())) {
            used.add(bot.name.toLowerCase());
            continue;
        }
        const choices = BOT_NAMES.filter(n => !used.has(n.toLowerCase()));
        bot.name = choices.length ? choices[randInt(choices.length)] : `Player${randInt(999)}`;
        used.add(bot.name.toLowerCase());
    } }
    private scheduleBotFill(delay: number) {
        if (!this.state.room.botsEnabled || this.state.room.rosterLocked || !["lobby", "countdown", "game-over"].includes(this.state.phase) || !this.humanPlayers().length)
            return;
        if (this.botFillTimer && delay !== 0)
            return;
        if (this.botFillTimer) {
            clearTimeout(this.botFillTimer);
            this.botFillTimer = null;
        }
        if (this.state.players.length >= MAX_PLAYERS) {
            this.nextBotAt = null;
            return;
        }
        this.nextBotAt = Date.now() + Math.max(0, delay);
        this.persistSoon();
        this.botFillTimer = setTimeout(() => { this.botFillTimer = null; this.nextBotAt = null; if (this.state.room.rosterLocked || this.state.players.length >= MAX_PLAYERS || (!this.humanPlayers().length && !this.state.room.startCommitted)) { this.persistSoon();
            return; } this.addBot(); if (this.state.players.length < MAX_PLAYERS)
            this.scheduleBotFill(randBetween(PUBLIC_NEXT_BOT_MIN_MS, PUBLIC_NEXT_BOT_MAX_MS)); this.evaluateLobbyStart(); this.persistSoon(); this.broadcastState(); }, Math.max(0, delay));
    }
    private addBot() {
        if (this.state.players.length >= MAX_PLAYERS)
            return;
        const usedNames = new Set(this.state.players.map(p => p.name.toLowerCase()));
        const choices = BOT_NAMES.filter(n => !usedNames.has(n.toLowerCase()));
        const name = choices.length ? choices[randInt(choices.length)] : `Player${randInt(999)}`;
        const usedColors = new Set(this.state.players.map(p => p.color));
        const color = PLAYER_COLORS.find(c => !usedColors.has(c)) ?? PLAYER_COLORS[this.state.players.length % PLAYER_COLORS.length];
        const tile = this.pickSpawnTile(new Set(this.state.players.map(p => p.tileId)));
        const pid = id("p");
        const p = this.newPlayer(pid, name, color, tile, false);
        this.state.players.push(p);
        this.botPlayerIds.add(pid);
        const delay = randBetween(BOT_READY_MIN_MS, BOT_READY_MAX_MS);
        const timer = setTimeout(() => { this.botTimers.delete(timer); const bot = this.state.players.find(x => x.id === pid); if (bot && ["lobby", "game-over"].includes(this.state.phase) && !this.state.room.startCommitted) {
            bot.ready = true;
            this.evaluateLobbyStart();
            this.persistSoon();
            this.broadcastState();
        } }, delay);
        this.botTimers.add(timer);
    }
    private removeBot(pid: string, persist = true) { this.state.players = this.state.players.filter(p => p.id !== pid); this.botPlayerIds.delete(pid); delete this.state.fairness.cycleCounts[pid]; this.state.fairness.doubledPlayers = this.state.fairness.doubledPlayers.filter(x => x !== pid); if (persist)
        this.persistSoon(); }
    private evaluateLobbyStart() {
        if (this.state.room.startCommitted || !["lobby", "game-over"].includes(this.state.phase))
            return;
        const humans = this.connectedHumans();
        if (!humans.length)
            return;
        const ready = this.humanReadyCount() >= this.humanReadyRequired();
        if (!ready)
            return;
        if (this.state.room.botsEnabled) {
            if (this.state.players.length === MAX_PLAYERS)
                this.commitStart(false);
        }
        else if (humans.length >= MIN_PLAYERS)
            this.commitStart(false);
    }
    private commitStart(force: boolean) {
        if (this.state.room.startCommitted)
            return;
        const humans = this.connectedHumans();
        if (!humans.length)
            return;
        if (!force && this.humanReadyCount() < this.humanReadyRequired())
            return;
        if (!this.state.room.botsEnabled && humans.length < MIN_PLAYERS)
            return;
        if (this.state.room.botsEnabled && this.state.players.length < MAX_PLAYERS) {
            this.scheduleBotFill(0);
            return;
        }
        this.state.room.startCommitted = true;
        this.state.phase = "countdown";
        this.state.phaseEndsAt = Date.now() + START_COUNTDOWN_MS;
        this.state.message = "Match starting";
        this.schedulePhase(START_COUNTDOWN_MS, () => this.startCommittedMatch());
        this.persistSoon();
        this.broadcastState();
    }
    private startCommittedMatch() {
        if (!this.state.room.startCommitted)
            return;
        if (this.state.room.botsEnabled)
            while (this.state.players.length < MAX_PLAYERS)
                this.addBot();
        const humans = this.connectedHumans();
        if (!this.state.room.botsEnabled && humans.length < MIN_PLAYERS) {
            this.state.room.startCommitted = false;
            this.state.phase = "lobby";
            this.state.phaseEndsAt = null;
            this.state.message = "Waiting for players";
            this.broadcastState();
            return;
        }
        this.state.room.rosterLocked = true;
        if (this.botFillTimer) clearTimeout(this.botFillTimer);
        this.botFillTimer = null;
        this.nextBotAt = null;
        this.state.players = this.state.players.filter(p => this.botPlayerIds.has(p.id) || p.connected);
        for (const p of this.state.players)
            p.host = false;
        const firstHuman = this.humanPlayers()[0] ?? this.state.players[0];
        if (firstHuman)
            firstHuman.host = true;
        this.disconnectedAt = {};
        this.resetMatchPlayers();
        this.state.round = 0;
        this.state.fairness = { cycleCounts: {}, doubledPlayers: [] };
        this.beginRound();
    }
    private beginRound() {
        this.clearBotTimers();
        this.state.round++;
        this.state.tiles = assignRandomColors(makeHexes(BOARD_RADIUS));
        this.state.selectedColor = null;
        this.state.selectorId = null;
        this.state.selectorCandidates = [];
        this.state.powerups = this.spawnPowerups();
        for (const p of this.state.players) {
            if (!p.alive)
                continue;
            blankMotion(p);
            blankCollision(p);
        }
        this.state.phase = "movement";
        this.state.phaseEndsAt = Date.now() + MOVEMENT_PHASE_MS;
        this.state.message = `Round ${this.state.round} — move!`;
        this.lastTick = Date.now();
        this.startMovementLoop();
        this.scheduleBotMovement();
        this.schedulePhase(MOVEMENT_PHASE_MS, () => this.lockMovement());
        this.persistSoon();
        this.broadcastState();
    }
    private lockMovement() {
        this.stopMovementLoop();
        this.clearBotTimers();
        for (const p of this.state.players) {
            blankMotion(p);
            blankCollision(p);
        }
        const eligible = this.selectorEligiblePlayers();
        if (!eligible.length)
            return this.finishMatch();
        this.state.selectorCandidates = eligible.map(p => p.id);
        const selector = this.pickSelector(eligible);
        if (!selector)
            return this.finishMatch();
        this.state.selectorId = selector.id;
        this.state.phase = "selector-wheel";
        this.state.phaseEndsAt = Date.now() + SELECTOR_WHEEL_MS;
        this.state.message = "Choosing the floor controller…";
        this.schedulePhase(SELECTOR_WHEEL_MS, () => this.beginSelectorChoice());
        this.persistSoon();
        this.broadcastState();
    }
    private beginSelectorChoice() {
        this.state.phase = "selector-choice";
        this.state.phaseEndsAt = Date.now() + SELECTOR_CHOICE_MS;
        const selector = this.state.players.find(p => p.id === this.state.selectorId);
        this.state.message = `${selector?.name ?? "Player"} is choosing a color`;
        if (selector && this.botPlayerIds.has(selector.id)) {
            const delay = randBetween(BOT_SELECTOR_MIN_MS, BOT_SELECTOR_MAX_MS);
            const t = setTimeout(() => { this.botTimers.delete(t); const current = this.state.players.find(p => p.id === selector.id); if (!current || this.state.phase !== "selector-choice")
                return; const tile = this.state.tiles.find(x => x.id === current.tileId); const choices = TILE_COLORS.filter(c => c !== tile?.color); this.revealColor(choices[randInt(choices.length)]); }, delay);
            this.botTimers.add(t);
        }
        this.schedulePhase(SELECTOR_CHOICE_MS, () => { if (!this.state.selectedColor) {
            const p = this.state.players.find(x => x.id === this.state.selectorId);
            const own = this.state.tiles.find(t => t.id === p?.tileId)?.color;
            const choices = TILE_COLORS.filter(c => c !== own);
            this.revealColor(choices[randInt(choices.length)]);
        } });
        this.persistSoon();
        this.broadcastState();
    }
    private chooseColor(p: PlayerState, color: TileColor) { if (this.state.phase !== "selector-choice" || this.state.selectorId !== p.id || !TILE_COLORS.includes(color))
        return; this.revealColor(color); }
    private revealColor(color: TileColor) {
        if (this.phaseTimer)
            clearTimeout(this.phaseTimer);
        this.clearBotTimers();
        this.state.selectedColor = color;
        this.state.phase = "reveal";
        this.state.phaseEndsAt = Date.now() + REVEAL_WINDOW_MS;
        this.state.message = `${color.toUpperCase()} DROPS!`;
        for (const bot of this.botPlayers()) {
            if (!bot.alive || bot.powerup !== "phase")
                continue;
            const tile = this.state.tiles.find(t => t.id === bot.tileId);
            if (tile?.color === color) {
                const t = setTimeout(() => { this.botTimers.delete(t); this.usePowerup(bot); this.persistSoon(); this.broadcastState(); }, randBetween(160, 850));
                this.botTimers.add(t);
            }
        }
        this.schedulePhase(REVEAL_WINDOW_MS, () => this.resolveElimination());
        this.persistSoon();
        this.broadcastState();
    }
    private resolveElimination() { const doomed = this.state.selectedColor; if (!doomed)
        return; const gone: string[] = []; for (const p of this.state.players) {
        if (!p.alive)
            continue;
        const t = this.state.tiles.find(x => x.id === p.tileId);
        if (t?.color === doomed) {
            p.alive = false;
            gone.push(p.name);
        }
    } const alive = this.state.players.filter(p => p.alive); this.state.phase = "results"; this.state.phaseEndsAt = Date.now() + RESULTS_MS; this.state.message = gone.length ? `${gone.join(", ")} eliminated` : "No player eliminated"; this.schedulePhase(RESULTS_MS, () => alive.length <= 1 ? this.finishMatch() : this.beginRound()); this.persistSoon(); this.broadcastState(); }
    private finishMatch() { this.stopMovementLoop(); this.clearBotTimers(); const alive = this.state.players.filter(p => p.alive); if (alive.length === 1) {
        alive[0].wins++;
        this.state.message = `${alive[0].name} wins!`;
    }
    else
        this.state.message = "Draw!"; this.state.phase = "game-over"; this.state.phaseEndsAt = null; this.state.selectorId = null; this.state.selectorCandidates = []; this.state.selectedColor = null; this.state.room.rosterLocked = false; this.state.room.startCommitted = false; for (const p of this.state.players)
        p.ready = false; if (this.state.room.botsEnabled) {
        this.scheduleExistingBotsReady();
        this.scheduleBotFill(PUBLIC_FIRST_BOT_DELAY_MS);
    } this.persistSoon(); this.broadcastState(); }
    private requestMove(p: PlayerState, tileId: number) { if (this.state.phase !== "movement" || !p.alive)
        return; const now = Date.now(); if (p.collisionUntil && p.collisionUntil > now)
        return; if (this.hasCommittedCollision(p, now))
        return; if (!this.state.tiles.some(t => t.id === tileId))
        return; if (this.state.players.some(o => o.alive && o.id !== p.id && o.tileId === tileId))
        return; p.destinationTileId = tileId; this.recomputePath(p); }
    private collisionReservations(now = Date.now()) { const map = new Map<number, string>(); for (const player of this.state.players) {
        if (player.collisionUntil && player.collisionUntil > now && player.collisionResolveTileId != null)
            map.set(player.collisionResolveTileId, player.id);
    } return map; }
    private recomputePath(p: PlayerState) { if (p.destinationTileId == null)
        return; const blocked = new Set(this.state.players.filter(o => o.alive && o.id !== p.id && o.tileId !== p.destinationTileId).map(o => o.tileId)); for (const [tileId, owner] of this.collisionReservations()) {
        if (owner !== p.id)
            blocked.add(tileId);
    } p.path = pathfind(this.state.tiles, p.tileId, p.destinationTileId, blocked); this.queueNextStep(p); }
    private queueNextStep(p: PlayerState) { if (p.movingToTileId != null || !p.path.length)
        return; const next = p.path.shift()!, now = Date.now(), step = p.speedBoostUntil && p.speedBoostUntil > now ? SPEED_STEP_MS : BASE_STEP_MS; p.movingFromTileId = p.tileId; p.movingToTileId = next; p.moveStartedAt = now; p.moveEndsAt = now + step; }
    private hasCommittedCollision(p: PlayerState, now: number) { if (p.movingToTileId == null || p.moveEndsAt == null)
        return false; const t = p.moveEndsAt - now; if (t < 0 || t > COLLISION_COMMIT_MS)
        return false; return this.state.players.some(o => { if (!o.alive || o.id === p.id || this.pairCooling(p, o, now))
        return false; if (o.tileId === p.movingToTileId)
        return !(o.movingToTileId != null && o.moveEndsAt != null && o.moveEndsAt < p.moveEndsAt! - 35); if (o.movingToTileId == null || o.moveEndsAt == null)
        return false; return (o.movingToTileId === p.movingToTileId || (o.movingToTileId === p.tileId && p.movingToTileId === o.tileId)) && Math.abs(o.moveEndsAt - p.moveEndsAt!) <= COLLISION_COMMIT_MS; }); }
    private startMovementLoop() { this.stopMovementLoop(); this.movementTimer = setInterval(() => this.tickMovement(), 40); }
    private stopMovementLoop() { if (this.movementTimer)
        clearInterval(this.movementTimer); this.movementTimer = null; }
    private pairCooling(a: PlayerState, b: PlayerState, now = Date.now()) { const until = this.pairCooldowns.get(pairKey(a.id, b.id)) ?? 0; if (until <= now) {
        this.pairCooldowns.delete(pairKey(a.id, b.id));
        return false;
    } return true; }
    private tickMovement() {
        if (this.state.phase !== "movement")
            return this.stopMovementLoop();
        const now = Date.now();
        for (const p of this.state.players) {
            if (p.collisionUntil && p.collisionUntil <= now)
                this.resolveCollisionPlayer(p, now);
            if (p.bubbleUntil && p.bubbleUntil <= now)
                p.bubbleUntil = null;
        }
        const due = this.state.players.filter(p => p.alive && p.movingToTileId != null && p.moveEndsAt != null && p.moveEndsAt <= now && !(p.collisionUntil && p.collisionUntil > now));
        const handled = new Set<string>();
        for (let i = 0; i < due.length; i++) {
            const a = due[i];
            if (handled.has(a.id))
                continue;
            for (let j = i + 1; j < due.length; j++) {
                const b = due[j];
                if (handled.has(b.id) || this.pairCooling(a, b, now))
                    continue;
                const head = a.movingToTileId === b.tileId && b.movingToTileId === a.tileId, same = a.movingToTileId === b.movingToTileId;
                if (head || same) {
                    this.applyCollision(a, b, head ? "head-on" : "glancing", now);
                    handled.add(a.id);
                    handled.add(b.id);
                    break;
                }
            }
        }
        let changed = handled.size > 0;
        for (const p of due) {
            if (handled.has(p.id) || p.movingToTileId == null)
                continue;
            const target = p.movingToTileId;
            const reservedBy = this.collisionReservations(now).get(target);
            if (reservedBy && reservedBy !== p.id) {
                p.path = [];
                blankMotionStep(p);
                this.recomputePath(p);
                changed = true;
                continue;
            }
            const occ = this.state.players.find(o => o.alive && o.id !== p.id && o.tileId === target);
            if (occ) {
                if (this.pairCooling(p, occ, now)) {
                    p.path = [];
                    blankMotionStep(p);
                    this.recomputePath(p);
                    changed = true;
                    continue;
                }
                this.applyCollision(p, occ, occ.movingToTileId === p.tileId ? "head-on" : "glancing", now);
                handled.add(p.id);
                handled.add(occ.id);
                changed = true;
                continue;
            }
            p.tileId = target;
            blankMotionStep(p);
            this.collectPowerup(p);
            this.queueNextStep(p);
            changed = true;
        }
        if (changed || now - this.lastTick > 250) {
            this.lastTick = now;
            this.broadcastState();
        }
    }
    private applyCollision(a: PlayerState, b: PlayerState, type: "glancing" | "head-on", now: number) {
        const aBubble = (a.bubbleUntil ?? 0) > now, bBubble = (b.bubbleUntil ?? 0) > now;
        if (aBubble !== bBubble) {
            this.applyBubbleCollision(aBubble ? a : b, aBubble ? b : a, now);
            return;
        }
        const event = id("col"), duration = type === "head-on" ? HEAD_ON_COLLISION_MS : GLANCING_COLLISION_MS;
        const occupied = new Set(this.state.players.filter(p => p.alive && p.id !== a.id && p.id !== b.id).map(p => p.tileId));
        for (const [tileId, owner] of this.collisionReservations(now)) {
            if (owner !== a.id && owner !== b.id)
                occupied.add(tileId);
        }
        let aRole: CollisionRole = "equal", bRole: CollisionRole = "equal", aResolve = a.tileId, bResolve = b.tileId;
        if (type === "glancing") {
            const target = a.movingToTileId === b.movingToTileId ? a.movingToTileId : (a.movingToTileId === b.tileId ? b.tileId : b.movingToTileId === a.tileId ? a.tileId : null);
            const aArrival = a.moveEndsAt ?? Infinity, bArrival = b.moveEndsAt ?? Infinity;
            let aWins: boolean;
            if (a.movingToTileId === b.tileId && b.movingToTileId == null)
                aWins = false;
            else if (b.movingToTileId === a.tileId && a.movingToTileId == null)
                aWins = true;
            else
                aWins = aArrival < bArrival || (aArrival === bArrival && a.id < b.id);
            const winner = aWins ? a : b, loser = aWins ? b : a;
            if (target != null && !occupied.has(target)) {
                if (winner.id === a.id)
                    aResolve = target;
                else
                    bResolve = target;
            }
            const sidestep = this.pickCollisionSidestep(loser, occupied, new Set([aResolve, bResolve, target ?? -1]));
            if (sidestep != null) {
                if (loser.id === a.id)
                    aResolve = sidestep;
                else
                    bResolve = sidestep;
            }
            aRole = aWins ? "priority" : "yield";
            bRole = aWins ? "yield" : "priority";
        }
        else {
            const aSide = this.pickCollisionSidestep(a, occupied, new Set([b.tileId]));
            if (aSide != null)
                aResolve = aSide;
            occupied.add(aResolve);
            const bSide = this.pickCollisionSidestep(b, occupied, new Set([a.tileId, aResolve]));
            if (bSide != null)
                bResolve = bSide;
            aRole = "equal";
            bRole = "equal";
        }
        this.setCollision(a, b, event, type, aRole, aResolve, now, duration);
        this.setCollision(b, a, event, type, bRole, bResolve, now, duration);
        this.pairCooldowns.set(pairKey(a.id, b.id), now + duration + COLLISION_PAIR_COOLDOWN_MS);
    }
    private applyBubbleCollision(source: PlayerState, victim: PlayerState, now: number) { const event = id("col"), occupied = new Set(this.state.players.filter(p => p.alive && p.id !== victim.id).map(p => p.tileId)); for (const [tileId, owner] of this.collisionReservations(now)) {
        if (owner !== victim.id)
            occupied.add(tileId);
    } const knocked = this.pickKnockTile(source, victim, occupied); this.setCollision(source, victim, event, "bubble", "source", source.tileId, now, 110); this.setCollision(victim, source, event, "bubble", "victim", knocked ?? victim.tileId, now, BUBBLE_COLLISION_MS); this.pairCooldowns.set(pairKey(source.id, victim.id), now + BUBBLE_COLLISION_MS + COLLISION_PAIR_COOLDOWN_MS); }
    private setCollision(p: PlayerState, other: PlayerState, event: string, type: PlayerState["collisionType"], role: CollisionRole, resolve: number, now: number, duration: number) { p.collisionStartedAt = now; p.collisionUntil = now + duration; p.collisionType = type; p.collisionEventId = event; p.collisionPartnerId = other.id; p.collisionResolveTileId = resolve; p.collisionRole = role; blankMotionStep(p); }
    private resolveCollisionPlayer(p: PlayerState, now: number) { const desired = p.collisionResolveTileId; const occupied = new Set(this.state.players.filter(o => o.alive && o.id !== p.id).map(o => o.tileId)); if (desired != null && !occupied.has(desired))
        p.tileId = desired;
    else if (desired != null && desired !== p.tileId) {
        const fallback = this.pickCollisionSidestep(p, occupied, new Set(this.collisionReservations(now).keys()));
        if (fallback != null)
            p.tileId = fallback;
    } blankCollision(p); this.collectPowerup(p); this.recomputePath(p); if (p.movingToTileId == null && p.destinationTileId != null && p.destinationTileId !== p.tileId && !this.state.players.some(o => o.alive && o.id !== p.id && o.tileId === p.destinationTileId)) {
        this.recomputePath(p);
    } }
    private pickCollisionSidestep(p: PlayerState, occupied: Set<number>, reserved: Set<number>) { const tile = this.state.tiles.find(t => t.id === p.tileId); if (!tile)
        return null; const options = shuffled(neighbors(tile, this.state.tiles)).filter(t => !occupied.has(t.id) && !reserved.has(t.id)); if (!options.length)
        return null; if (p.destinationTileId != null) {
        const dest = this.state.tiles.find(t => t.id === p.destinationTileId);
        if (dest)
            options.sort((a, b) => hexDistance(a, dest) - hexDistance(b, dest));
    } return options[0]?.id ?? null; }
    private pickKnockTile(source: PlayerState, victim: PlayerState, occupied: Set<number>) { const s = this.state.tiles.find(t => t.id === source.tileId), v = this.state.tiles.find(t => t.id === victim.tileId); if (!s || !v)
        return null; const vx = v.q - s.q, vy = v.r - s.r; const opts = neighbors(v, this.state.tiles).filter(t => !occupied.has(t.id)); if (!opts.length)
        return null; opts.sort((a, b) => ((b.q - v.q) * vx + (b.r - v.r) * vy) - ((a.q - v.q) * vx + (a.r - v.r) * vy)); return opts[0].id; }
    private scheduleExistingBotsReady() { for (const bot of this.botPlayers()) {
        bot.ready = false;
        const delay = randBetween(BOT_READY_MIN_MS, BOT_READY_MAX_MS);
        const t = setTimeout(() => { this.botTimers.delete(t); if (!["lobby", "game-over"].includes(this.state.phase) || this.state.room.startCommitted)
            return; const current = this.state.players.find(p => p.id === bot.id); if (!current)
            return; current.ready = true; this.persistSoon(); this.broadcastState(); }, delay);
        this.botTimers.add(t);
    } }
    private scheduleBotMovement() { for (const bot of this.botPlayers().filter(p => p.alive)) {
        const count = 2 + randInt(5);
        const lastTiles: number[] = [];
        for (let i = 0; i < count; i++) {
            const offset = Math.round(((i + .55) / count) * (MOVEMENT_PHASE_MS - 850));
            const t = setTimeout(() => { this.botTimers.delete(t); if (this.state.phase !== "movement" || !bot.alive)
                return; const blocked = new Set(this.state.players.filter(p => p.alive && p.id !== bot.id).map(p => p.tileId)); let choices = this.state.tiles.filter(x => x.id !== bot.tileId && !blocked.has(x.id) && x.id !== lastTiles.at(-1)); if (!choices.length)
                return; const dest = choices[randInt(choices.length)]; lastTiles.push(dest.id); bot.destinationTileId = dest.id; this.recomputePath(bot); if (bot.powerup === "speed" && randInt(100) < 42)
                this.usePowerup(bot); if (bot.powerup === "bubble" && randInt(100) < 38)
                this.usePowerup(bot); this.broadcastState(); }, offset);
            this.botTimers.add(t);
        }
    } }
    private clearBotTimers() { for (const t of this.botTimers)
        clearTimeout(t); this.botTimers.clear(); }
    private collectPowerup(p: PlayerState) { if (p.powerup)
        return; const i = this.state.powerups.findIndex(x => x.tileId === p.tileId); if (i < 0)
        return; p.powerup = this.state.powerups[i].type; this.state.powerups.splice(i, 1); }
    private usePowerup(p: PlayerState) { if (!p.powerup || !p.alive)
        return; if (p.powerup === "speed") {
        if (this.state.phase !== "movement")
            return;
        p.speedBoostUntil = Date.now() + SPEED_DURATION_MS;
        p.powerup = null;
        return;
    } if (p.powerup === "bubble") {
        if (this.state.phase !== "movement")
            return;
        p.bubbleUntil = Date.now() + BUBBLE_DURATION_MS;
        p.powerup = null;
        return;
    } if (p.powerup === "phase") {
        if (this.state.phase !== "reveal" || !this.state.selectedColor)
            return;
        const cur = this.state.tiles.find(t => t.id === p.tileId);
        if (!cur || cur.color !== this.state.selectedColor)
            return;
        const occupied = new Set(this.state.players.filter(o => o.alive && o.id !== p.id).map(o => o.tileId));
        const safe = this.state.tiles.filter(t => t.color !== this.state.selectedColor && !occupied.has(t.id));
        if (!safe.length)
            return;
        p.tileId = safe[randInt(safe.length)].id;
        p.powerup = null;
    } }
    private spawnPowerups(): PowerupState[] { const roll = randInt(100), count = roll < 35 ? 0 : roll < 80 ? 1 : 2; const occupied = new Set(this.state.players.filter(p => p.alive).map(p => p.tileId)); const cells = shuffled(this.state.tiles.filter(t => !occupied.has(t.id))); const out: PowerupState[] = []; for (let i = 0; i < count && i < cells.length; i++) {
        const r = randInt(100);
        const type: PowerupType = r < 48 ? "speed" : r < 86 ? "bubble" : "phase";
        out.push({ id: id("pow"), type, tileId: cells[i].id });
    } return out; }
    private selectorEligiblePlayers() { const alive = this.state.players.filter(p => p.alive && (p.connected || this.botPlayerIds.has(p.id))); if (!alive.length)
        return []; const counts = this.state.fairness.cycleCounts; for (const p of alive)
        if (counts[p.id] == null)
            counts[p.id] = 0; if (alive.every(p => counts[p.id] >= 1)) {
        for (const p of alive)
            counts[p.id] = 0;
        this.state.fairness.doubledPlayers = [];
    } const zeros = alive.filter(p => counts[p.id] === 0), doubled = alive.filter(p => counts[p.id] >= 2); if (zeros.length && doubled.length >= 2)
        return zeros; const eligible = alive.filter(p => counts[p.id] < 2); return eligible.length ? eligible : (zeros.length ? zeros : alive); }
    private pickSelector(eligible: PlayerState[]) { if (!eligible.length)
        return null; const alive = this.state.players.filter(p => p.alive); const c = this.state.fairness.cycleCounts, chosen = eligible[randInt(eligible.length)]; c[chosen.id] = (c[chosen.id] ?? 0) + 1; this.state.fairness.doubledPlayers = alive.filter(p => c[p.id] >= 2).map(p => p.id); return chosen; }
    private pickSpawnTile(occupied: Set<number>) { const available = this.state.tiles.filter(t => !occupied.has(t.id)); if (!available.length)
        return 0; if (!occupied.size)
        return available[Math.floor(available.length / 2)].id; let best = available[0], score = -1; for (const t of available) {
        const s = Math.min(...Array.from(occupied).map(i => hexDistance(t, this.state.tiles.find(x => x.id === i)!)));
        if (s > score) {
            score = s;
            best = t;
        }
    } return best.id; }
    private resetMatchPlayers() { const occupied = new Set<number>(); for (const p of this.state.players) {
        p.alive = true;
        p.powerup = null;
        p.speedBoostUntil = null;
        p.bubbleUntil = null;
        p.tileId = this.pickSpawnTile(occupied);
        occupied.add(p.tileId);
        blankMotion(p);
        blankCollision(p);
    } }
    private transferHost() { for (const p of this.state.players)
        p.host = false; const h = this.connectedHumans()[0] ?? this.humanPlayers()[0]; if (h)
        h.host = true; }
    private async leavePlayer(pid: string) { const p = this.state.players.find(x => x.id === pid); if (!p)
        return; const wasHost = p.host, wasAlive = p.alive; this.state.players = this.state.players.filter(x => x.id !== pid); delete this.reconnectTokens[pid]; delete this.disconnectedAt[pid]; delete this.state.fairness.cycleCounts[pid]; this.state.fairness.doubledPlayers = this.state.fairness.doubledPlayers.filter(x => x !== pid); this.state.selectorCandidates = this.state.selectorCandidates.filter(x => x !== pid); if (this.state.selectorId === pid)
        this.state.selectorId = null; if (wasHost)
        this.transferHost(); if (this.state.players.length === 0) {
        this.created = false;
        await this.ctx.storage.deleteAll();
        return;
    } if (this.state.room.startCommitted) { /* countdown intentionally continues */ }
    else
        this.evaluateLobbyStart(); if (!["lobby", "game-over", "countdown"].includes(this.state.phase)) {
        const alive = this.state.players.filter(x => x.alive);
        if (wasAlive && alive.length <= 1)
            this.finishMatch();
        else if (this.state.phase === "selector-choice" && !this.state.selectorId)
            this.revealColor(TILE_COLORS[randInt(TILE_COLORS.length)]);
    } if (this.state.room.botsEnabled && !this.state.room.rosterLocked)
        this.scheduleBotFill(PUBLIC_NEXT_BOT_MIN_MS); await this.persist(); this.broadcastState(); }
    private async removeExpiredDisconnected(notify = true) { const cutoff = Date.now() - RECONNECT_GRACE_MS; const ids = this.state.players.filter(p => !this.botPlayerIds.has(p.id) && !p.connected && (this.disconnectedAt[p.id] ?? Infinity) <= cutoff).map(p => p.id); if (!ids.length)
        return; const set = new Set(ids); this.state.players = this.state.players.filter(p => !set.has(p.id)); for (const x of ids) {
        delete this.disconnectedAt[x];
        delete this.reconnectTokens[x];
        delete this.state.fairness.cycleCounts[x];
    } if (!this.state.players.length) {
        this.created = false;
        if (notify)
            await this.ctx.storage.deleteAll();
        else {
            this.state = emptyState(this.roomCode, this.state.room.visibility, this.state.room.botsEnabled, this.state.room.quickPlay);
            await this.persist();
        }
        return;
    } this.transferHost(); if (this.state.room.botsEnabled && !this.state.room.rosterLocked)
        this.scheduleBotFill(PUBLIC_NEXT_BOT_MIN_MS); await this.persist(); if (notify)
        this.broadcastState(); }
    private async scheduleDisconnectAlarm() { const exp = Object.entries(this.disconnectedAt).filter(([id]) => this.state.players.some(p => p.id === id && !p.connected)).map(([, t]) => t + RECONNECT_GRACE_MS + 100); if (!exp.length) {
        await this.ctx.storage.deleteAlarm();
        return;
    } await this.ctx.storage.setAlarm(Math.min(...exp)); }
    private schedulePhase(ms: number, fn: () => void) { if (this.phaseTimer)
        clearTimeout(this.phaseTimer); this.phaseTimer = setTimeout(() => { this.phaseTimer = null; fn(); }, Math.max(0, ms)); }
    private publicState() { return structuredClone(this.state); }
    private broadcastState() { const payload = encodeServerMessage({ type: "state", state: this.publicState(), serverTime: Date.now() }); for (const s of this.ctx.getWebSockets())
        try {
            s.send(payload);
        }
        catch { } }
    private hasAnotherSocketForPlayer(pid: string, current: WebSocket) { return this.ctx.getWebSockets().some(s => s !== current && (s.deserializeAttachment() as SocketAttachment | null)?.playerId === pid); }
    private closeDuplicateSockets(pid: string, current: WebSocket) { for (const s of this.ctx.getWebSockets()) {
        if (s === current)
            continue;
        if ((s.deserializeAttachment() as SocketAttachment | null)?.playerId !== pid)
            continue;
        try {
            s.close(1000, "Reconnected from another tab");
        }
        catch { }
    } }
    private sendError(ws: WebSocket, message: string) { try {
        ws.send(encodeServerMessage({ type: "error", message }));
    }
    catch { } }
    private rejectSocket(ws: WebSocket, message: string) { this.sendError(ws, message); try {
        ws.close(1008, message.slice(0, 100));
    }
    catch { } }
    private persistSoon() { void this.persist(); }
    private async persist() { await this.ctx.storage.put<StoredRoom>(STORAGE_KEY, { created: this.created, state: this.state, reconnectTokens: this.reconnectTokens, disconnectedAt: this.disconnectedAt, botPlayerIds: [...this.botPlayerIds], nextBotAt: this.nextBotAt }); }
}
function blankMotionStep(p: PlayerState) { p.movingFromTileId = null; p.movingToTileId = null; p.moveStartedAt = null; p.moveEndsAt = null; }

