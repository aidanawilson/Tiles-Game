import { DurableObject } from "cloudflare:workers";
import { GameRoom } from "./GameRoom";
interface Env {
    GAME_ROOMS: DurableObjectNamespace<GameRoom>;
}
const ROOMS_KEY = "publicRooms";
function randomRoomCode(length = 4) { const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; const bytes = crypto.getRandomValues(new Uint8Array(length)); return Array.from(bytes, b => alphabet[b % alphabet.length]).join(""); }
export class Matchmaker extends DurableObject<Env> {
    private roomStub(code: string) { return this.env.GAME_ROOMS.get(this.env.GAME_ROOMS.idFromName(code)); }
    async fetch(request: Request) {
        const url = new URL(request.url);
        if (url.pathname === "/register" && request.method === "POST") {
            const code = (url.searchParams.get("code") || "").toUpperCase();
            const rooms = await this.ctx.storage.get<string[]>(ROOMS_KEY) ?? [];
            if (code && !rooms.includes(code)) {
                rooms.push(code);
                await this.ctx.storage.put(ROOMS_KEY, rooms.slice(-120));
            }
            return Response.json({ ok: true });
        }
        if (url.pathname === "/quick-play" && request.method === "POST") {
            const rooms = await this.ctx.storage.get<string[]>(ROOMS_KEY) ?? [];
            const shuffled = [...rooms].sort(() => Math.random() - .5);
            const keep: string[] = [];
            let openRoom: string | null = null;
            for (const code of shuffled) {
                try {
                    const r = await this.roomStub(code).fetch("https://room.internal/status");
                    if (!r.ok) continue;
                    const status = await r.json() as { visibility?: string; matchmakingOpen?: boolean; connectedHumans?: number };
                    // Zero-human public rooms are stale/abandoned for matchmaking.
                    if (status.visibility !== "public" || (status.connectedHumans ?? 0) <= 0) continue;
                    keep.push(code);
                    if (!openRoom && status.matchmakingOpen) openRoom = code;
                } catch { }
            }
            await this.ctx.storage.put(ROOMS_KEY, keep.slice(-120));
            if (openRoom)
                return Response.json({ roomCode: openRoom, created: false });
            for (let i = 0; i < 16; i++) {
                const code = randomRoomCode();
                const r = await this.roomStub(code).fetch(`https://room.internal/create?code=${code}&visibility=public&bots=1&quick=1`, { method: "POST" });
                if (r.status === 201) {
                    keep.push(code);
                    await this.ctx.storage.put(ROOMS_KEY, keep.slice(-120));
                    return Response.json({ roomCode: code, created: true }, { status: 201 });
                }
            }
            return Response.json({ error: "Could not create a public room. Try again." }, { status: 503 });
        }
        return new Response("Not found", { status: 404 });
    }
}

