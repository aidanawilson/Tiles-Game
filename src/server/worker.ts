import { GameRoom } from "./GameRoom";

export { GameRoom };

interface Env {
  GAME_ROOMS: DurableObjectNamespace<GameRoom>;
}

const ROOM_CODE_RE = /^[A-Z0-9]{4}$/;

function randomRoomCode(length = 4): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
}

function roomStub(env: Env, roomCode: string) {
  const id = env.GAME_ROOMS.idFromName(roomCode);
  return env.GAME_ROOMS.get(id);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/api/rooms" && request.method === "POST") {
      for (let i = 0; i < 12; i++) {
        const roomCode = randomRoomCode();
        const response = await roomStub(env, roomCode).fetch(
          `https://room.internal/create?code=${roomCode}`,
          { method: "POST" },
        );
        if (response.status === 201) {
          return Response.json(
            { roomCode, joinUrl: `${url.origin}/room/${roomCode}` },
            { status: 201 },
          );
        }
      }
      return Response.json(
        { error: "Could not allocate a room code. Try again." },
        { status: 503 },
      );
    }

    const statusMatch = url.pathname.match(/^\/api\/rooms\/([A-Z0-9]{4})$/i);
    if (statusMatch && request.method === "GET") {
      const roomCode = statusMatch[1].toUpperCase();
      if (!ROOM_CODE_RE.test(roomCode)) {
        return Response.json({ exists: false }, { status: 404 });
      }
      return roomStub(env, roomCode).fetch("https://room.internal/status");
    }

    const wsMatch = url.pathname.match(/^\/api\/rooms\/([A-Z0-9]{4})\/ws$/i);
    if (wsMatch) {
      const roomCode = wsMatch[1].toUpperCase();
      return roomStub(env, roomCode).fetch(
        new Request(`https://room.internal/ws?code=${roomCode}`, request),
      );
    }

    return new Response("Not found", { status: 404 });
  },
} satisfies ExportedHandler<Env>;
