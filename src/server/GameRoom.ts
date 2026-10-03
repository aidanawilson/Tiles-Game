import { DurableObject } from "cloudflare:workers";
import {
  BASE_STEP_MS,
  BOARD_RADIUS,
  COLLISION_COMMIT_MS,
  GLANCING_COLLISION_MS,
  HEAD_ON_COLLISION_MS,
  MAX_PLAYERS,
  MIN_PLAYERS,
  MOVEMENT_PHASE_MS,
  RECONNECT_GRACE_MS,
  RESULTS_MS,
  REVEAL_WINDOW_MS,
  SELECTOR_CHOICE_MS,
  SELECTOR_WHEEL_MS,
  SPEED_DURATION_MS,
  SPEED_STEP_MS,
  START_COUNTDOWN_MS,
} from "../shared/constants";
import { encodeServerMessage, parseClientMessage } from "../shared/messages";
import {
  PLAYER_COLORS,
  TILE_COLORS,
  type ClientMessage,
  type GameState,
  type HexTile,
  type PlayerState,
  type PowerupState,
  type PowerupType,
  type TileColor,
} from "../shared/types";

interface Env {}

interface SocketAttachment {
  playerId: string;
}

interface StoredRoom {
  created: boolean;
  state: GameState;
  reconnectTokens: Record<string, string>;
  disconnectedAt: Record<string, number>;
}

const STORAGE_KEY = "room";

function id(prefix = "id"): string {
  return `${prefix}_${crypto.randomUUID().replaceAll("-", "").slice(0, 12)}`;
}

function hexDistance(a: HexTile, b: HexTile): number {
  const as = -a.q - a.r;
  const bs = -b.q - b.r;
  return Math.max(Math.abs(a.q - b.q), Math.abs(a.r - b.r), Math.abs(as - bs));
}

function makeHexes(radius: number): HexTile[] {
  const tiles: HexTile[] = [];
  let tileId = 0;
  for (let q = -radius; q <= radius; q++) {
    const r1 = Math.max(-radius, -q - radius);
    const r2 = Math.min(radius, -q + radius);
    for (let r = r1; r <= r2; r++) {
      tiles.push({ id: tileId++, q, r, color: "red" });
    }
  }
  return tiles;
}

function shuffled<T>(items: T[]): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const buf = new Uint32Array(1);
    crypto.getRandomValues(buf);
    const j = buf[0] % (i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function randomIndex(length: number): number {
  const bytes = new Uint32Array(1);
  crypto.getRandomValues(bytes);
  return bytes[0] % length;
}

function assignRandomColors(tiles: HexTile[]): HexTile[] {
  // Keep every color represented, but intentionally uneven. The 2–5 cap avoids
  // degenerate boards while still making every round feel different.
  const counts = new Map<TileColor, number>();
  const bag: TileColor[] = [];
  for (const color of TILE_COLORS) {
    counts.set(color, 2);
    bag.push(color, color);
  }
  while (bag.length < tiles.length) {
    const eligible = TILE_COLORS.filter((color) => (counts.get(color) ?? 0) < 5);
    const color = eligible[randomIndex(eligible.length)];
    counts.set(color, (counts.get(color) ?? 0) + 1);
    bag.push(color);
  }
  const colors = shuffled(bag);
  return tiles.map((tile, i) => ({ ...tile, color: colors[i] }));
}

function neighbors(tile: HexTile, tiles: HexTile[]): HexTile[] {
  const directions = [
    [1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1],
  ];
  const byCoord = new Map(tiles.map((t) => [`${t.q},${t.r}`, t]));
  return directions
    .map(([dq, dr]) => byCoord.get(`${tile.q + dq},${tile.r + dr}`))
    .filter(Boolean) as HexTile[];
}

function pathfind(tiles: HexTile[], startId: number, goalId: number, blocked: Set<number>): number[] {
  if (startId === goalId) return [];
  const start = tiles.find((t) => t.id === startId);
  const goal = tiles.find((t) => t.id === goalId);
  if (!start || !goal || blocked.has(goalId)) return [];

  const queue = [start];
  const cameFrom = new Map<number, number | null>([[start.id, null]]);

  while (queue.length) {
    const current = queue.shift()!;
    if (current.id === goal.id) break;
    for (const next of neighbors(current, tiles)) {
      if (blocked.has(next.id) || cameFrom.has(next.id)) continue;
      cameFrom.set(next.id, current.id);
      queue.push(next);
    }
  }

  if (!cameFrom.has(goal.id)) return [];
  const path: number[] = [];
  let cursor: number | null = goal.id;
  while (cursor !== null && cursor !== start.id) {
    path.unshift(cursor);
    cursor = cameFrom.get(cursor) ?? null;
  }
  return path;
}

function emptyState(roomCode: string): GameState {
  return {
    roomCode,
    phase: "lobby",
    round: 0,
    tiles: assignRandomColors(makeHexes(BOARD_RADIUS)),
    players: [],
    powerups: [],
    selectorId: null,
    selectorCandidates: [],
    selectedColor: null,
    phaseEndsAt: null,
    message: "Waiting for players",
    fairness: { cycleCounts: {}, doubledPlayers: [] },
  };
}

export class GameRoom extends DurableObject<Env> {
  private roomCode = "";
  private created = false;
  private state: GameState = emptyState("");
  private reconnectTokens: Record<string, string> = {};
  private disconnectedAt: Record<string, number> = {};
  private phaseTimer: ReturnType<typeof setTimeout> | null = null;
  private movementTimer: ReturnType<typeof setInterval> | null = null;
  private lastTick = Date.now();

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.ctx.blockConcurrencyWhile(async () => {
      const stored = await this.ctx.storage.get<StoredRoom>(STORAGE_KEY);
      if (stored) {
        this.created = stored.created;
        this.state = stored.state;
        this.state.selectorCandidates ??= [];
        const alreadyUsed = new Set<string>();
        for (let i = 0; i < this.state.players.length; i++) {
          const player = this.state.players[i] as PlayerState & { color?: string };
          if (!player.color || alreadyUsed.has(player.color)) {
            player.color = PLAYER_COLORS.find((color) => !alreadyUsed.has(color)) ?? PLAYER_COLORS[i % PLAYER_COLORS.length];
          }
          alreadyUsed.add(player.color);
        }
        this.roomCode = stored.state.roomCode;
        this.reconnectTokens = stored.reconnectTokens ?? {};
        this.disconnectedAt = stored.disconnectedAt ?? {};

        // Hibernating Durable Objects can be reconstructed while WebSockets stay
        // connected. Recover connection state from each socket attachment instead
        // of assuming every player disconnected.
        const connectedIds = new Set(
          this.ctx.getWebSockets()
            .map((socket) => socket.deserializeAttachment() as SocketAttachment | null)
            .filter((attachment): attachment is SocketAttachment => Boolean(attachment?.playerId))
            .map((attachment) => attachment.playerId),
        );
        for (const player of this.state.players) player.connected = connectedIds.has(player.id);

        // Timed match phases intentionally fall back to the lobby after an
        // unexpected isolate restart. Lobby/game-over state can safely survive
        // hibernation because neither depends on an in-memory phase timer.
        if (this.state.phase !== "lobby" && this.state.phase !== "game-over") {
          for (const player of this.state.players) {
            player.ready = false;
            player.alive = true;
            player.destinationTileId = null;
            player.path = [];
            player.movingFromTileId = null;
            player.movingToTileId = null;
            player.moveStartedAt = null;
            player.moveEndsAt = null;
            player.collisionUntil = null;
            player.collisionType = null;
            player.avoidTileId = null;
            player.avoidUntil = null;
          }
          this.state.phase = "lobby";
          this.state.phaseEndsAt = null;
          this.state.message = "Match reset after server restart";
          await this.persist();
        }
      }
    });
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/create" && request.method === "POST") {
      if (this.created) return new Response("exists", { status: 409 });
      this.roomCode = (url.searchParams.get("code") || "").toUpperCase();
      this.created = true;
      this.state = emptyState(this.roomCode);
      await this.persist();
      return new Response("created", { status: 201 });
    }

    if (url.pathname === "/status" && request.method === "GET") {
      if (!this.created) return Response.json({ exists: false }, { status: 404 });
      return Response.json({
        exists: true,
        roomCode: this.roomCode,
        phase: this.state.phase,
        players: this.state.players.filter((p) => p.connected).length,
        maxPlayers: MAX_PLAYERS,
      });
    }

    if (url.pathname === "/ws") {
      if (!this.created) return new Response("Room not found", { status: 404 });
      if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
        return new Response("Expected websocket", { status: 426 });
      }
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);
      this.ctx.acceptWebSocket(server);
      return new Response(null, { status: 101, webSocket: client });
    }

    return new Response("Not found", { status: 404 });
  }

  async webSocketMessage(ws: WebSocket, raw: ArrayBuffer | string) {
    const text = typeof raw === "string" ? raw : new TextDecoder().decode(raw);
    if (text.length > 1024) return this.sendError(ws, "Message too large");
    const message = parseClientMessage(text);
    if (!message) return this.sendError(ws, "Invalid message");

    const attachment = ws.deserializeAttachment() as SocketAttachment | null;
    if (message.type === "hello") {
      await this.handleHello(ws, message);
      return;
    }
    if (!attachment?.playerId) return this.sendError(ws, "Join the room first");

    const player = this.state.players.find((p) => p.id === attachment.playerId);
    if (!player) return this.sendError(ws, "Player not found");

    switch (message.type) {
      case "ready":
        if (this.state.phase === "lobby") player.ready = message.ready;
        break;
      case "start-game":
        if (player.host) this.tryStartGame();
        break;
      case "move":
        this.requestMove(player, message.tileId);
        break;
      case "choose-color":
        this.chooseColor(player, message.color);
        break;
      case "use-powerup":
        this.usePowerup(player);
        break;
      case "leave-room":
        await this.leavePlayer(player.id);
        try { ws.close(1000, "Player left room"); } catch {}
        return;
      case "ping":
        ws.send(encodeServerMessage({ type: "pong", clientTime: message.clientTime, serverTime: Date.now() }));
        return;
    }

    await this.persist();
    this.broadcastState();
  }

  async webSocketClose(ws: WebSocket) {
    const attachment = ws.deserializeAttachment() as SocketAttachment | null;
    if (!attachment?.playerId) return;

    // A refresh can briefly overlap the old and new WebSockets. If another
    // accepted socket already owns this player identity, the player is still
    // connected and the old socket closing must not start the grace timer.
    if (this.hasAnotherSocketForPlayer(attachment.playerId, ws)) return;

    const player = this.state.players.find((p) => p.id === attachment.playerId);
    if (player) {
      player.connected = false;
      this.disconnectedAt[player.id] = Date.now();
      if (player.host) this.transferHost();
      await this.persist();
      await this.scheduleDisconnectAlarm();
      this.broadcastState();
    }
  }

  async alarm() {
    await this.removeExpiredDisconnected();
    await this.scheduleDisconnectAlarm();
  }

  webSocketError(ws: WebSocket) {
    try { ws.close(1011, "Socket error"); } catch {}
  }

  private async handleHello(ws: WebSocket, message: Extract<ClientMessage, { type: "hello" }>) {
    await this.removeExpiredDisconnected(false);
    const cleanName = message.name.trim().slice(0, 16) || "Player";
    let player: PlayerState | undefined;

    if (message.playerId && message.reconnectToken) {
      const valid = this.reconnectTokens[message.playerId] === message.reconnectToken;
      if (valid) player = this.state.players.find((p) => p.id === message.playerId);
    }

    if (!player) {
      if (this.state.players.length >= MAX_PLAYERS) {
        this.rejectSocket(ws, "This room is full");
        return;
      }
      if (this.state.phase !== "lobby" && this.state.phase !== "game-over") {
        this.rejectSocket(ws, "A match is already in progress");
        return;
      }
      const playerId = id("p");
      const token = crypto.randomUUID();
      const occupied = new Set(this.state.players.map((p) => p.tileId));
      const spawn = this.pickSpawnTile(occupied);
      const usedColors = new Set(this.state.players.map((p) => p.color));
      const playerColor = PLAYER_COLORS.find((color) => !usedColors.has(color)) ?? PLAYER_COLORS[this.state.players.length % PLAYER_COLORS.length];
      player = {
        id: playerId,
        name: cleanName,
        color: playerColor,
        tileId: spawn,
        alive: true,
        connected: true,
        ready: false,
        wins: 0,
        host: this.state.players.length === 0,
        destinationTileId: null,
        path: [],
        movingFromTileId: null,
        movingToTileId: null,
        moveStartedAt: null,
        moveEndsAt: null,
        collisionUntil: null,
        collisionType: null,
        avoidTileId: null,
        avoidUntil: null,
        powerup: null,
        speedBoostUntil: null,
      };
      this.state.players.push(player);
      this.reconnectTokens[playerId] = token;
    } else {
      player.connected = true;
      player.name = cleanName;
      delete this.disconnectedAt[player.id];
      await this.scheduleDisconnectAlarm();
    }

    ws.serializeAttachment({ playerId: player.id } satisfies SocketAttachment);
    this.closeDuplicateSockets(player.id, ws);
    await this.persist();
    ws.send(encodeServerMessage({
      type: "welcome",
      playerId: player.id,
      reconnectToken: this.reconnectTokens[player.id],
      state: this.publicState(),
      serverTime: Date.now(),
    }));
    this.broadcastState();
  }

  private tryStartGame() {
    const connected = this.state.players.filter((p) => p.connected);
    if (connected.length < MIN_PLAYERS) return;

    const isRematch = this.state.phase === "game-over";
    if (!isRematch && this.state.phase !== "lobby") return;
    if (!isRematch && !connected.every((p) => p.ready || p.host)) return;

    // Starting a match intentionally drops any currently disconnected seats.
    this.state.players = connected;
    for (const p of this.state.players) p.host = false;
    this.state.players[0].host = true;
    this.disconnectedAt = {};
    this.resetMatchPlayers();
    this.state.round = 0;
    this.state.fairness = { cycleCounts: {}, doubledPlayers: [] };
    this.state.phase = "countdown";
    this.state.phaseEndsAt = Date.now() + START_COUNTDOWN_MS;
    this.state.message = "Get ready";
    this.schedulePhase(START_COUNTDOWN_MS, () => this.beginRound());
    this.persistSoon();
    this.broadcastState();
  }

  private beginRound() {
    this.state.round += 1;
    this.state.tiles = assignRandomColors(makeHexes(BOARD_RADIUS));
    this.state.selectedColor = null;
    this.state.selectorId = null;
    this.state.selectorCandidates = [];
    this.state.powerups = this.spawnPowerups();
    for (const p of this.state.players) {
      if (!p.alive) continue;
      p.path = [];
      p.destinationTileId = null;
      p.movingFromTileId = null;
      p.movingToTileId = null;
      p.moveStartedAt = null;
      p.moveEndsAt = null;
      p.collisionUntil = null;
      p.collisionType = null;
      p.avoidTileId = null;
      p.avoidUntil = null;
    }
    this.state.phase = "movement";
    this.state.phaseEndsAt = Date.now() + MOVEMENT_PHASE_MS;
    this.state.message = `Round ${this.state.round} — move!`;
    this.lastTick = Date.now();
    this.startMovementLoop();
    this.schedulePhase(MOVEMENT_PHASE_MS, () => this.lockMovement());
    this.persistSoon();
    this.broadcastState();
  }

  private lockMovement() {
    this.stopMovementLoop();
    for (const p of this.state.players) {
      p.path = [];
      p.destinationTileId = null;
      p.movingFromTileId = null;
      p.movingToTileId = null;
      p.moveStartedAt = null;
      p.moveEndsAt = null;
      p.collisionUntil = null;
      p.collisionType = null;
      p.avoidTileId = null;
      p.avoidUntil = null;
    }
    const eligible = this.selectorEligiblePlayers();
    if (!eligible.length) return this.finishMatch();
    this.state.selectorCandidates = eligible.map((p) => p.id);
    const selector = this.pickSelector(eligible);
    if (!selector) return this.finishMatch();
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
    const selector = this.state.players.find((p) => p.id === this.state.selectorId);
    this.state.message = `${selector?.name ?? "Player"} is choosing a color`;
    this.schedulePhase(SELECTOR_CHOICE_MS, () => {
      if (!this.state.selectedColor) {
        this.revealColor(TILE_COLORS[randomIndex(TILE_COLORS.length)]);
      }
    });
    this.persistSoon();
    this.broadcastState();
  }

  private chooseColor(player: PlayerState, color: TileColor) {
    if (this.state.phase !== "selector-choice" || this.state.selectorId !== player.id) return;
    if (!TILE_COLORS.includes(color)) return;
    this.revealColor(color);
  }

  private revealColor(color: TileColor) {
    if (this.phaseTimer) clearTimeout(this.phaseTimer);
    this.state.selectedColor = color;
    this.state.phase = "reveal";
    this.state.phaseEndsAt = Date.now() + REVEAL_WINDOW_MS;
    this.state.message = `${color.toUpperCase()} DROPS!`;
    this.schedulePhase(REVEAL_WINDOW_MS, () => this.resolveElimination());
    this.persistSoon();
    this.broadcastState();
  }

  private resolveElimination() {
    const doomed = this.state.selectedColor;
    if (!doomed) return;
    const eliminated: string[] = [];
    for (const player of this.state.players) {
      if (!player.alive) continue;
      const tile = this.state.tiles.find((t) => t.id === player.tileId);
      if (tile?.color === doomed) {
        player.alive = false;
        eliminated.push(player.name);
      }
    }

    const alive = this.state.players.filter((p) => p.alive);
    this.state.phase = "results";
    this.state.phaseEndsAt = Date.now() + RESULTS_MS;
    this.state.message = eliminated.length ? `${eliminated.join(", ")} eliminated` : "No player eliminated";
    if (alive.length <= 1) {
      this.schedulePhase(RESULTS_MS, () => this.finishMatch());
    } else {
      this.schedulePhase(RESULTS_MS, () => this.beginRound());
    }
    this.persistSoon();
    this.broadcastState();
  }

  private finishMatch() {
    this.stopMovementLoop();
    const alive = this.state.players.filter((p) => p.alive);
    if (alive.length === 1) {
      alive[0].wins += 1;
      this.state.message = `${alive[0].name} wins!`;
    } else {
      this.state.message = "Draw!";
    }
    this.state.phase = "game-over";
    this.state.phaseEndsAt = null;
    this.state.selectorId = null;
    this.state.selectorCandidates = [];
    this.state.selectedColor = null;
    for (const p of this.state.players) p.ready = false;
    this.persistSoon();
    this.broadcastState();
  }

  private requestMove(player: PlayerState, tileId: number) {
    if (this.state.phase !== "movement" || !player.alive) return;
    const now = Date.now();
    if (player.collisionUntil && player.collisionUntil > now) return;
    if (this.hasCommittedCollision(player, now)) return;
    if (!this.state.tiles.some((t) => t.id === tileId)) return;
    if (this.state.players.some((p) => p.alive && p.id !== player.id && p.tileId === tileId)) return;
    player.destinationTileId = tileId;
    this.recomputePath(player);
  }

  private recomputePath(player: PlayerState) {
    if (player.destinationTileId == null) return;
    // Moving players are not treated as permanent walls. Routes may cross, and
    // the authoritative movement loop resolves resulting collisions. After a
    // collision, a short-lived avoided tile forces the next route around the
    // conflict instead of immediately repeating the same impact.
    const now = Date.now();
    if (player.avoidUntil != null && player.avoidUntil <= now) {
      player.avoidUntil = null;
      player.avoidTileId = null;
    }
    const blocked = new Set<number>();
    if (player.avoidTileId != null && player.avoidUntil != null && player.avoidUntil > now) {
      blocked.add(player.avoidTileId);
    }
    player.path = pathfind(this.state.tiles, player.tileId, player.destinationTileId, blocked);
    this.queueNextStep(player);
  }

  private hasCommittedCollision(player: PlayerState, now: number): boolean {
    if (player.movingToTileId == null || player.moveEndsAt == null) return false;
    const playerMoveEndsAt = player.moveEndsAt;
    const timeToImpact = playerMoveEndsAt - now;
    if (timeToImpact < 0 || timeToImpact > COLLISION_COMMIT_MS) return false;

    return this.state.players.some((other) => {
      if (!other.alive || other.id === player.id) return false;
      if (other.tileId === player.movingToTileId) {
        // If the occupant is moving away and will clear the tile before impact,
        // do not commit a collision yet.
        if (other.movingToTileId != null && other.moveEndsAt != null && other.moveEndsAt < playerMoveEndsAt - 35) {
          return false;
        }
        return true;
      }
      if (other.movingToTileId == null || other.moveEndsAt == null) return false;
      const sameTarget = other.movingToTileId === player.movingToTileId;
      const headOn = other.movingToTileId === player.tileId && player.movingToTileId === other.tileId;
      return (sameTarget || headOn) && Math.abs(other.moveEndsAt - playerMoveEndsAt) <= COLLISION_COMMIT_MS;
    });
  }

  private queueNextStep(player: PlayerState) {
    if (player.movingToTileId != null || player.path.length === 0) return;
    const next = player.path.shift()!;
    const now = Date.now();
    const stepMs = player.speedBoostUntil && player.speedBoostUntil > now ? SPEED_STEP_MS : BASE_STEP_MS;
    player.movingFromTileId = player.tileId;
    player.movingToTileId = next;
    player.moveStartedAt = now;
    player.moveEndsAt = now + stepMs;
  }

  private startMovementLoop() {
    this.stopMovementLoop();
    this.movementTimer = setInterval(() => this.tickMovement(), 40);
  }

  private stopMovementLoop() {
    if (this.movementTimer) clearInterval(this.movementTimer);
    this.movementTimer = null;
  }

  private tickMovement() {
    if (this.state.phase !== "movement") return this.stopMovementLoop();
    const now = Date.now();

    for (const p of this.state.players) {
      if (p.collisionUntil && p.collisionUntil <= now) {
        p.collisionUntil = null;
        p.collisionType = null;
        p.movingFromTileId = null;
        p.movingToTileId = null;
        p.moveStartedAt = null;
        p.moveEndsAt = null;
        this.recomputePath(p);
      }
    }

    const due = this.state.players.filter(
      (p) => p.alive && p.movingToTileId != null && p.moveEndsAt != null && p.moveEndsAt <= now && !(p.collisionUntil && p.collisionUntil > now),
    );

    const handled = new Set<string>();
    for (let i = 0; i < due.length; i++) {
      const a = due[i];
      if (handled.has(a.id)) continue;
      for (let j = i + 1; j < due.length; j++) {
        const b = due[j];
        if (handled.has(b.id)) continue;
        const headOn = a.movingToTileId === b.tileId && b.movingToTileId === a.tileId;
        const sameTarget = a.movingToTileId === b.movingToTileId;
        if (headOn || sameTarget) {
          this.applyCollision(a, b, headOn ? "head-on" : "glancing", now);
          handled.add(a.id);
          handled.add(b.id);
          break;
        }
      }
    }

    let changed = handled.size > 0;
    for (const p of due) {
      if (handled.has(p.id) || p.movingToTileId == null) continue;
      const target = p.movingToTileId;
      const occupant = this.state.players.find((other) => other.alive && other.id !== p.id && other.tileId === target);
      if (occupant) {
        const headOn = occupant.movingToTileId === p.tileId;
        this.applyCollision(p, occupant, headOn ? "head-on" : "glancing", now);
        handled.add(p.id);
        handled.add(occupant.id);
        changed = true;
        continue;
      }
      p.tileId = target;
      p.movingFromTileId = null;
      p.movingToTileId = null;
      p.moveStartedAt = null;
      p.moveEndsAt = null;
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
    const duration = type === "head-on" ? HEAD_ON_COLLISION_MS : GLANCING_COLLISION_MS;
    const aTarget = a.movingToTileId;
    const bTarget = b.movingToTileId;
    const aArrival = a.moveEndsAt ?? Number.POSITIVE_INFINITY;
    const bArrival = b.moveEndsAt ?? Number.POSITIVE_INFINITY;
    const avoidUntil = now + duration + 900;

    if (type === "head-on") {
      // Each player routes around the other's current cell after recovering.
      // This produces the intended sidestep/pass behavior and prevents an
      // endless head-on bounce loop.
      a.avoidTileId = b.tileId;
      b.avoidTileId = a.tileId;
      a.avoidUntil = avoidUntil;
      b.avoidUntil = avoidUntil;
    } else {
      const contested = aTarget != null && aTarget === bTarget
        ? aTarget
        : aTarget === b.tileId
          ? b.tileId
          : bTarget === a.tileId
            ? a.tileId
            : null;

      if (contested != null) {
        let loser: PlayerState;
        if (aTarget === b.tileId && bTarget == null) {
          // A ran into a player who was standing still. A must route around.
          loser = a;
        } else if (bTarget === a.tileId && aTarget == null) {
          loser = b;
        } else {
          // For a tied/same-target collision, one route gets priority and the
          // other must go around. Earlier simulated arrival wins; exact ties use
          // the stable player id so every client sees the same result.
          const aWins = aArrival < bArrival || (aArrival === bArrival && a.id < b.id);
          loser = aWins ? b : a;
        }
        loser.avoidTileId = contested;
        loser.avoidUntil = avoidUntil;
      }
    }

    for (const p of [a, b]) {
      p.collisionType = type;
      p.collisionUntil = now + duration;
      p.movingFromTileId = null;
      p.movingToTileId = null;
      p.moveStartedAt = null;
      p.moveEndsAt = null;
    }
  }

  private collectPowerup(player: PlayerState) {
    if (player.powerup) return;
    const index = this.state.powerups.findIndex((p) => p.tileId === player.tileId);
    if (index < 0) return;
    player.powerup = this.state.powerups[index].type;
    this.state.powerups.splice(index, 1);
  }

  private usePowerup(player: PlayerState) {
    if (!player.powerup || !player.alive) return;
    if (player.powerup === "speed") {
      if (this.state.phase !== "movement") return;
      player.speedBoostUntil = Date.now() + SPEED_DURATION_MS;
      player.powerup = null;
      return;
    }
    if (player.powerup === "phase") {
      if (this.state.phase !== "reveal" || !this.state.selectedColor) return;
      const current = this.state.tiles.find((t) => t.id === player.tileId);
      if (!current || current.color !== this.state.selectedColor) return;
      const occupied = new Set(this.state.players.filter((p) => p.alive && p.id !== player.id).map((p) => p.tileId));
      const safe = this.state.tiles.filter((t) => t.color !== this.state.selectedColor && !occupied.has(t.id));
      if (!safe.length) return;
      player.tileId = safe[randomIndex(safe.length)].id;
      player.powerup = null;
    }
  }

  private spawnPowerups(): PowerupState[] {
    const roll = randomIndex(100);
    const count = roll < 35 ? 0 : roll < 80 ? 1 : 2;
    const occupied = new Set(this.state.players.filter((p) => p.alive).map((p) => p.tileId));
    const candidates = shuffled(this.state.tiles.filter((t) => !occupied.has(t.id)));
    const result: PowerupState[] = [];
    for (let i = 0; i < count && i < candidates.length; i++) {
      const type: PowerupType = randomIndex(100) < 88 ? "speed" : "phase";
      result.push({ id: id("pow"), type, tileId: candidates[i].id });
    }
    return result;
  }

  private selectorEligiblePlayers(): PlayerState[] {
    const alive = this.state.players.filter((p) => p.alive && p.connected);
    if (!alive.length) return [];
    const counts = this.state.fairness.cycleCounts;
    for (const p of alive) if (counts[p.id] == null) counts[p.id] = 0;

    if (alive.every((p) => counts[p.id] >= 1)) {
      for (const p of alive) counts[p.id] = 0;
      this.state.fairness.doubledPlayers = [];
    }

    const zeros = alive.filter((p) => counts[p.id] === 0);
    const doubled = alive.filter((p) => counts[p.id] >= 2);
    if (zeros.length && doubled.length >= 2) return zeros;
    const eligible = alive.filter((p) => counts[p.id] < 2);
    return eligible.length ? eligible : (zeros.length ? zeros : alive);
  }

  private pickSelector(eligible: PlayerState[]): PlayerState | null {
    if (!eligible.length) return null;
    const alive = this.state.players.filter((p) => p.alive && p.connected);
    const counts = this.state.fairness.cycleCounts;
    const chosen = eligible[randomIndex(eligible.length)];
    counts[chosen.id] = (counts[chosen.id] ?? 0) + 1;
    this.state.fairness.doubledPlayers = alive.filter((p) => counts[p.id] >= 2).map((p) => p.id);
    return chosen;
  }

  private pickSpawnTile(occupied: Set<number>): number {
    const available = this.state.tiles.filter((t) => !occupied.has(t.id));
    if (!available.length) return 0;
    if (!occupied.size) return available[Math.floor(available.length / 2)].id;
    let best = available[0];
    let bestScore = -1;
    for (const tile of available) {
      const score = Math.min(...Array.from(occupied).map((id) => {
        const other = this.state.tiles.find((t) => t.id === id)!;
        return hexDistance(tile, other);
      }));
      if (score > bestScore) { bestScore = score; best = tile; }
    }
    return best.id;
  }

  private resetMatchPlayers() {
    const connected = this.state.players.filter((p) => p.connected);
    const occupied = new Set<number>();
    for (const player of connected) {
      player.alive = true;
      player.powerup = null;
      player.speedBoostUntil = null;
      player.tileId = this.pickSpawnTile(occupied);
      occupied.add(player.tileId);
      player.path = [];
      player.destinationTileId = null;
      player.movingFromTileId = null;
      player.movingToTileId = null;
      player.moveStartedAt = null;
      player.moveEndsAt = null;
      player.collisionUntil = null;
      player.collisionType = null;
      player.avoidTileId = null;
      player.avoidUntil = null;
    }
  }

  private transferHost() {
    const connected = this.state.players.filter((p) => p.connected);
    for (const p of this.state.players) p.host = false;
    if (connected.length) connected[0].host = true;
  }

  private async leavePlayer(playerId: string) {
    const leaving = this.state.players.find((p) => p.id === playerId);
    if (!leaving) return;

    const wasHost = leaving.host;
    const wasAlive = leaving.alive;
    this.state.players = this.state.players.filter((p) => p.id !== playerId);
    delete this.reconnectTokens[playerId];
    delete this.disconnectedAt[playerId];
    delete this.state.fairness.cycleCounts[playerId];
    this.state.fairness.doubledPlayers = this.state.fairness.doubledPlayers.filter((id) => id !== playerId);
    this.state.selectorCandidates = this.state.selectorCandidates.filter((id) => id !== playerId);
    if (this.state.selectorId === playerId) this.state.selectorId = null;

    if (this.state.players.length === 0) {
      this.reconnectTokens = {};
      this.disconnectedAt = {};
      this.created = false;
      await this.ctx.storage.deleteAll();
      return;
    }

    if (wasHost || !this.state.players.some((p) => p.host)) this.transferHost();

    const activeMatch = !["lobby", "game-over"].includes(this.state.phase);
    if (activeMatch) {
      const alive = this.state.players.filter((p) => p.alive);
      if (wasAlive && alive.length <= 1) {
        this.finishMatch();
      } else if (this.state.phase === "selector-choice" && !this.state.selectorId) {
        this.state.phase = "reveal";
        this.revealColor(TILE_COLORS[randomIndex(TILE_COLORS.length)]);
      }
    }

    await this.persist();
    this.broadcastState();
  }

  private async removeExpiredDisconnected(notify = true) {
    const cutoff = Date.now() - RECONNECT_GRACE_MS;
    const removedIds = this.state.players
      .filter((p) => !p.connected && (this.disconnectedAt[p.id] ?? Infinity) <= cutoff)
      .map((p) => p.id);

    if (!removedIds.length) return;
    const removed = new Set(removedIds);
    this.state.players = this.state.players.filter((p) => !removed.has(p.id));
    for (const playerId of removedIds) {
      delete this.disconnectedAt[playerId];
      delete this.reconnectTokens[playerId];
      delete this.state.fairness.cycleCounts[playerId];
    }
    this.state.fairness.doubledPlayers = this.state.fairness.doubledPlayers.filter((id) => !removed.has(id));

    // A room is intentionally temporary. Once the final reserved seat expires,
    // delete its persisted state so the four-character code can be reused later.
    if (this.state.players.length === 0) {
      this.reconnectTokens = {};
      this.disconnectedAt = {};
      if (notify) {
        this.created = false;
        await this.ctx.storage.deleteAll();
      } else {
        // A handshake that arrives exactly as the final grace period expires
        // keeps the room code alive and simply starts a fresh lobby.
        this.state = emptyState(this.roomCode);
        await this.persist();
      }
      return;
    }

    if (!this.state.players.some((p) => p.host)) this.transferHost();

    const activeMatch = !["lobby", "game-over"].includes(this.state.phase);
    if (activeMatch && this.state.players.filter((p) => p.alive).length <= 1) {
      this.finishMatch();
    }

    await this.persist();
    if (notify) this.broadcastState();
  }

  private async scheduleDisconnectAlarm() {
    const expirations = Object.entries(this.disconnectedAt)
      .filter(([playerId]) => this.state.players.some((p) => p.id === playerId && !p.connected))
      .map(([, disconnectedAt]) => disconnectedAt + RECONNECT_GRACE_MS + 100);
    if (!expirations.length) {
      await this.ctx.storage.deleteAlarm();
      return;
    }
    await this.ctx.storage.setAlarm(Math.min(...expirations));
  }

  private schedulePhase(ms: number, fn: () => void) {
    if (this.phaseTimer) clearTimeout(this.phaseTimer);
    this.phaseTimer = setTimeout(() => {
      this.phaseTimer = null;
      fn();
    }, ms);
  }

  private publicState(): GameState {
    return structuredClone(this.state);
  }

  private broadcastState() {
    const payload = encodeServerMessage({ type: "state", state: this.publicState(), serverTime: Date.now() });
    for (const socket of this.ctx.getWebSockets()) {
      try { socket.send(payload); } catch {}
    }
  }


  private hasAnotherSocketForPlayer(playerId: string, current: WebSocket): boolean {
    return this.ctx.getWebSockets().some((socket) => {
      if (socket === current) return false;
      const attachment = socket.deserializeAttachment() as SocketAttachment | null;
      return attachment?.playerId === playerId;
    });
  }

  private closeDuplicateSockets(playerId: string, current: WebSocket) {
    for (const socket of this.ctx.getWebSockets()) {
      if (socket === current) continue;
      const attachment = socket.deserializeAttachment() as SocketAttachment | null;
      if (attachment?.playerId !== playerId) continue;
      try { socket.close(1000, "Reconnected from another tab"); } catch {}
    }
  }

  private sendError(ws: WebSocket, message: string) {
    try { ws.send(encodeServerMessage({ type: "error", message })); } catch {}
  }

  private rejectSocket(ws: WebSocket, message: string) {
    this.sendError(ws, message);
    try { ws.close(1008, message.slice(0, 100)); } catch {}
  }

  private persistSoon() {
    void this.persist();
  }

  private async persist() {
    await this.ctx.storage.put<StoredRoom>(STORAGE_KEY, {
      created: this.created,
      state: this.state,
      reconnectTokens: this.reconnectTokens,
      disconnectedAt: this.disconnectedAt,
    });
  }
}
