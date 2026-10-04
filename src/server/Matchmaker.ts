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
            for (const code of shuffled) {
                try {
                    const r = await this.roomStub(code).fetch("https://room.internal/status");
                    if (!r.ok)
                        continue;
                    const s = await r.json() as {
                        visibility?: string;
                        matchmakingOpen?: boolean;
                    };
                    if (s.visibility === "public")
                        keep.push(code);
                    if (s.visibility === "public" && s.matchmakingOpen) {
                        await this.ctx.storage.put(ROOMS_KEY, keep.concat(rooms.filter(x => !keep.includes(x) && x !== code)).slice(-120));
                        return Response.json({ roomCode: code, created: false });
                    }
                }
                catch { }
            }
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

