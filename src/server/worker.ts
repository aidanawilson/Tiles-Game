import { GameRoom } from "./GameRoom";
import { Matchmaker } from "./Matchmaker";
export { GameRoom, Matchmaker };
interface Env {
    GAME_ROOMS: DurableObjectNamespace<GameRoom>;
    MATCHMAKER: DurableObjectNamespace<Matchmaker>;
}
const ROOM_CODE_RE = /^[A-Z0-9]{4}$/;
function randomRoomCode(length = 4) { const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; const bytes = crypto.getRandomValues(new Uint8Array(length)); return Array.from(bytes, b => alphabet[b % alphabet.length]).join(""); }
function roomStub(env: Env, code: string) { return env.GAME_ROOMS.get(env.GAME_ROOMS.idFromName(code)); }
function matchmaker(env: Env) { return env.MATCHMAKER.get(env.MATCHMAKER.idFromName("GLOBAL")); }
export default { async fetch(request: Request, env: Env): Promise<Response> {
        const url = new URL(request.url);
        if (url.pathname === "/api/quick-play" && request.method === "POST")
            return matchmaker(env).fetch("https://match.internal/quick-play", { method: "POST" });
        if (url.pathname === "/api/rooms" && request.method === "POST") {
            let input: {
                visibility?: "public" | "private";
                botsEnabled?: boolean;
            } = {};
            try {
                input = await request.json() as typeof input;
            }
            catch { }
            const visibility = input.visibility === "public" ? "public" : "private";
            const bots = visibility === "public" ? true : Boolean(input.botsEnabled);
            for (let i = 0; i < 12; i++) {
                const code = randomRoomCode();
                const response = await roomStub(env, code).fetch(`https://room.internal/create?code=${code}&visibility=${visibility}&bots=${bots ? 1 : 0}&quick=0`, { method: "POST" });
                if (response.status === 201) {
                    if (visibility === "public")
                        await matchmaker(env).fetch(`https://match.internal/register?code=${code}`, { method: "POST" });
                    return Response.json({ roomCode: code, joinUrl: `${url.origin}/room/${code}` }, { status: 201 });
                }
            }
            return Response.json({ error: "Could not allocate a room code. Try again." }, { status: 503 });
        }
        const status = url.pathname.match(/^\/api\/rooms\/([A-Z0-9]{4})$/i);
        if (status && request.method === "GET") {
            const code = status[1].toUpperCase();
            if (!ROOM_CODE_RE.test(code))
                return Response.json({ exists: false }, { status: 404 });
            return roomStub(env, code).fetch("https://room.internal/status");
        }
        const ws = url.pathname.match(/^\/api\/rooms\/([A-Z0-9]{4})\/ws$/i);
        if (ws) {
            const code = ws[1].toUpperCase();
            return roomStub(env, code).fetch(new Request(`https://room.internal/ws?code=${code}`, request));
        }
        return new Response("Not found", { status: 404 });
    } } satisfies ExportedHandler<Env>;

