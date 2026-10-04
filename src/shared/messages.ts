import { TILE_COLORS, type ClientMessage, type ServerMessage } from "./types";
export function parseClientMessage(raw: string): ClientMessage | null {
    try {
        const value = JSON.parse(raw) as Record<string, unknown>;
        if (!value || typeof value.type !== "string")
            return null;
        switch (value.type) {
            case "hello":
                if (typeof value.name !== "string")
                    return null;
                if (value.playerId !== undefined && typeof value.playerId !== "string")
                    return null;
                if (value.reconnectToken !== undefined && typeof value.reconnectToken !== "string")
                    return null;
                return {
                    type: "hello",
                    name: value.name,
                    playerId: value.playerId as string | undefined,
                    reconnectToken: value.reconnectToken as string | undefined,
                };
            case "ready":
                return typeof value.ready === "boolean" ? { type: "ready", ready: value.ready } : null;
            case "start-game":
                return { type: "start-game" };
            case "move":
                return Number.isInteger(value.tileId) ? { type: "move", tileId: value.tileId as number } : null;
            case "choose-color":
                return typeof value.color === "string" && TILE_COLORS.includes(value.color as (typeof TILE_COLORS)[number])
                    ? { type: "choose-color", color: value.color as (typeof TILE_COLORS)[number] }
                    : null;
            case "use-powerup":
                return { type: "use-powerup" };
            case "leave-room":
                return { type: "leave-room" };
            case "ping":
                return typeof value.clientTime === "number" && Number.isFinite(value.clientTime)
                    ? { type: "ping", clientTime: value.clientTime }
                    : null;
            default:
                return null;
        }
    }
    catch {
        return null;
    }
}
export function encodeServerMessage(message: ServerMessage): string {
    return JSON.stringify(message);
}

