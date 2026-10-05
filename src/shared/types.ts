export const TILE_COLORS = ["red", "orange", "yellow", "green", "blue", "violet"] as const;
export type TileColor = (typeof TILE_COLORS)[number];
export const PLAYER_COLORS = ["yellow", "blue", "red", "green", "pink"] as const;
export type PlayerColor = (typeof PLAYER_COLORS)[number];
export type RoomVisibility = "public" | "private";
export type GamePhase =
  | "lobby"
  | "countdown"
  | "shuffle"
  | "pre-round"
  | "movement"
  | "selector-wheel"
  | "selector-choice"
  | "reveal"
  | "results"
  | "podium"
  | "game-over";
export type PowerupType = "invisibility" | "override" | "phase";
export type CollisionType = "glancing" | "head-on" | "bubble";
export type CollisionRole = "priority" | "yield" | "equal" | "source" | "victim";

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
  color: PlayerColor;
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
  // Legacy collision fields are retained for safe migration of existing rooms.
  collisionUntil: number | null;
  collisionStartedAt: number | null;
  collisionType: CollisionType | null;
  collisionEventId: string | null;
  collisionPartnerId: string | null;
  collisionResolveTileId: number | null;
  collisionRole: CollisionRole | null;
  powerup: PowerupType | null;
  invisible: boolean;
  invisibilityActivatedAt: number | null;
  phaseShiftFromTileId: number | null;
  phaseShiftToTileId: number | null;
  phaseShiftAt: number | null;
  // Legacy boost fields are retained only so pre-v0.7 stored rooms migrate cleanly.
  speedBoostUntil: number | null;
  bubbleUntil: number | null;
}
export interface SelectorFairnessState {
  cycleCounts: Record<string, number>;
  doubledPlayers: string[];
}
export interface RoomSettingsState {
  visibility: RoomVisibility;
  botsEnabled: boolean;
  quickPlay: boolean;
  rosterLocked: boolean;
  startCommitted: boolean;
}
export interface GameState {
  roomCode: string;
  room: RoomSettingsState;
  phase: GamePhase;
  round: number;
  tiles: HexTile[];
  previousTiles: HexTile[] | null;
  shuffleStartedAt: number | null;
  players: PlayerState[];
  powerups: PowerupState[];
  selectorId: string | null;
  selectorCandidates: string[];
  selectedColor: TileColor | null;
  phaseEndsAt: number | null;
  message: string;
  fairness: SelectorFairnessState;
  overridePendingPlayerId: string | null;
  overrideActivatedAt: number | null;
  lastWinnerId: string | null;
  eliminationOrder: string[];
  podiumIds: string[];
  finalTwoAnnouncedAt: number | null;
}

export type ClientMessage =
  | { type: "hello"; name: string; playerId?: string; reconnectToken?: string }
  | { type: "ready"; ready: boolean }
  | { type: "start-game" }
  | { type: "move"; tileId: number }
  | { type: "choose-color"; color: TileColor }
  | { type: "use-powerup" }
  | { type: "leave-room" }
  | { type: "ping"; clientTime: number };

export type ServerMessage =
  | { type: "welcome"; playerId: string; reconnectToken: string; state: GameState; serverTime: number }
  | { type: "state"; state: GameState; serverTime: number }
  | { type: "error"; message: string }
  | { type: "pong"; clientTime: number; serverTime: number }
  | { type: "blocked-destination"; tileId: number; serverTime: number }
  | { type: "removed-inactivity"; serverTime: number };
