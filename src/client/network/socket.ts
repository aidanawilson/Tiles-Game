import type { ClientMessage, GameState, ServerMessage } from "../../shared/types";

type StateListener = (state: GameState, serverTime: number) => void;
type ErrorListener = (message: string) => void;
type ConnectionListener = (status: "connecting" | "connected" | "reconnecting" | "closed") => void;

export class RoomSocket {
  private ws: WebSocket | null = null;
  private stateListeners = new Set<StateListener>();
  private errorListeners = new Set<ErrorListener>();
  private connectionListeners = new Set<ConnectionListener>();
  private roomCode: string;
  private name: string;
  private closedByUser = false;
  private reconnectTimer: number | null = null;
  private reconnectAttempt = 0;
  private welcomed = false;

  playerId: string | null = null;
  reconnectToken: string | null = null;

  constructor(roomCode: string, name: string) {
    this.roomCode = roomCode;
    this.name = name;
  }

  connect() {
    this.closedByUser = false;
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) return;

    this.emitConnection(this.reconnectAttempt > 0 ? "reconnecting" : "connecting");
    const protocol = location.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(`${protocol}//${location.host}/api/rooms/${this.roomCode}/ws`);
    this.ws = ws;

    ws.addEventListener("open", () => {
      if (ws !== this.ws || this.closedByUser) return;
      const saved = this.loadIdentity();
      this.send({
        type: "hello",
        name: this.name,
        playerId: saved?.playerId,
        reconnectToken: saved?.reconnectToken,
      });
    });

    ws.addEventListener("message", (event) => {
      if (ws !== this.ws) return;
      this.handleMessage(String(event.data));
    });

    ws.addEventListener("error", () => {
      if (!this.welcomed) this.emitError("Could not connect to this room.");
    });

    ws.addEventListener("close", () => {
      if (ws !== this.ws) return;
      this.ws = null;
      if (this.closedByUser) {
        this.emitConnection("closed");
        return;
      }
      this.scheduleReconnect();
    });
  }

  close() {
    this.closedByUser = true;
    if (this.reconnectTimer !== null) window.clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    const ws = this.ws;
    this.ws = null;
    try { ws?.close(1000, "Leaving room"); } catch {}
    this.emitConnection("closed");
  }

  onState(listener: StateListener) {
    this.stateListeners.add(listener);
    return () => this.stateListeners.delete(listener);
  }

  onError(listener: ErrorListener) {
    this.errorListeners.add(listener);
    return () => this.errorListeners.delete(listener);
  }

  onConnection(listener: ConnectionListener) {
    this.connectionListeners.add(listener);
    return () => this.connectionListeners.delete(listener);
  }

  send(message: ClientMessage) {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(message));
  }

  private handleMessage(raw: string) {
    let message: ServerMessage;
    try { message = JSON.parse(raw) as ServerMessage; } catch { return; }

    if (message.type === "welcome") {
      this.welcomed = true;
      this.reconnectAttempt = 0;
      this.playerId = message.playerId;
      this.reconnectToken = message.reconnectToken;
      this.saveIdentity(message.playerId, message.reconnectToken);
      this.emitConnection("connected");
      this.stateListeners.forEach((listener) => listener(message.state, message.serverTime));
      return;
    }

    if (message.type === "state") {
      this.stateListeners.forEach((listener) => listener(message.state, message.serverTime));
      return;
    }

    if (message.type === "error") {
      this.emitError(message.message);
    }
  }

  private scheduleReconnect() {
    if (this.reconnectTimer !== null || this.closedByUser) return;
    this.reconnectAttempt += 1;
    this.emitConnection("reconnecting");
    const delay = Math.min(6000, 750 * 2 ** Math.min(this.reconnectAttempt - 1, 3));
    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }

  private emitError(message: string) {
    this.errorListeners.forEach((listener) => listener(message));
  }

  private emitConnection(status: "connecting" | "connected" | "reconnecting" | "closed") {
    this.connectionListeners.forEach((listener) => listener(status));
  }

  private saveIdentity(playerId: string, reconnectToken: string) {
    sessionStorage.setItem(
      `tiles:${this.roomCode}:identity`,
      JSON.stringify({ playerId, reconnectToken }),
    );
  }

  private loadIdentity(): { playerId: string; reconnectToken: string } | null {
    try {
      const raw = sessionStorage.getItem(`tiles:${this.roomCode}:identity`);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }
}
