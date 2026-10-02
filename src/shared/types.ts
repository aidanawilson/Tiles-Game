export const TILE_COLORS = ["red", "orange", "yellow", "green", "blue", "violet"] as const;
export type TileColor = (typeof TILE_COLORS)[number];

export type GamePhase =
  | "lobby"
  | "countdown"
  | "movement"
  | "selector-wheel"
  | "selector-choice"
  | "reveal"
  | "results"
  | "game-over";

export type PowerupType = "speed" | "phase";

export interface HexTile {
  id: number;
  q: number;
  r: number;
  color: TileColor;
}

export interface PowerupState {
  id: string;
  type: PowerupType;
  tileId: number;
}

export interface PlayerState {
  id: string;
  name: string;
  tileId: number;
  alive: boolean;
  connected: boolean;
  ready: boolean;
  wins: number;
  host: boolean;
  destinationTileId: number | null;
  path: number[];
  movingFromTileId: number | null;
  movingToTileId: number | null;
  moveStartedAt: number | null;
  moveEndsAt: number | null;
  collisionUntil: number | null;
  collisionType: "glancing" | "head-on" | null;
  avoidTileId: number | null;
  avoidUntil: number | null;
  powerup: PowerupType | null;
  speedBoostUntil: number | null;
}

export interface SelectorFairnessState {
  cycleCounts: Record<string, number>;
  doubledPlayers: string[];
}

export interface GameState {
  roomCode: string;
  phase: GamePhase;
  round: number;
  tiles: HexTile[];
  players: PlayerState[];
  powerups: PowerupState[];
  selectorId: string | null;
  selectedColor: TileColor | null;
  phaseEndsAt: number | null;
  message: string;
  fairness: SelectorFairnessState;
}

export type ClientMessage =
  | { type: "hello"; name: string; playerId?: string; reconnectToken?: string }
  | { type: "ready"; ready: boolean }
  | { type: "start-game" }
  | { type: "move"; tileId: number }
  | { type: "choose-color"; color: TileColor }
  | { type: "use-powerup" }
  | { type: "ping"; clientTime: number };

export type ServerMessage =
  | { type: "welcome"; playerId: string; reconnectToken: string; state: GameState; serverTime: number }
  | { type: "state"; state: GameState; serverTime: number }
  | { type: "error"; message: string }
  | { type: "pong"; clientTime: number; serverTime: number };
