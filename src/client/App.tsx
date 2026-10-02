import { useCallback, useEffect, useMemo, useState } from "react";
import type { GameState, TileColor } from "../shared/types";
import { TILE_COLORS } from "../shared/types";
import { GameCanvas } from "./game/GameCanvas";
import { RoomSocket } from "./network/socket";

const COLOR_LABELS: Record<TileColor, string> = {
  red: "Red",
  orange: "Orange",
  yellow: "Yellow",
  green: "Green",
  blue: "Blue",
  violet: "Violet",
};

function currentRoomCode(): string | null {
  const match = location.pathname.match(/^\/room\/([A-Z0-9]{4})$/i);
  return match ? match[1].toUpperCase() : null;
}

function isIOSBrowser(): boolean {
  return /iPad|iPhone|iPod/.test(navigator.userAgent);
}

function isStandalone(): boolean {
  return window.matchMedia?.("(display-mode: standalone)").matches ||
    Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
}

function Intro({ onDone }: { onDone: () => void }) {
  const [page, setPage] = useState(0);
  const [showInstall, setShowInstall] = useState(false);
  const showIPhoneTip = isIOSBrowser() && !isStandalone();

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="How to play Tiles">
      <div className="modal-card">
        {page === 0 ? (
          <>
            <div className="eyebrow">HOW TO PLAY</div>
            <h1>Move. Survive. Choose.</h1>
            <div className="tutorial-grid">
              <div><b>1</b><span>Tap any reachable hex. Your character runs there automatically.</span></div>
              <div><b>2</b><span>After 7 seconds, movement locks and one player is chosen.</span></div>
              <div><b>3</b><span>That player chooses a color. Every tile of that color drops.</span></div>
            </div>
            <div className="modal-actions">
              <button className="secondary" onClick={onDone}>Skip</button>
              <button className="primary" onClick={() => setPage(1)}>Next</button>
            </div>
          </>
        ) : (
          <>
            <div className="eyebrow">POWER & POSITION</div>
            <h1>Race for power-ups.</h1>
            <p>Power-ups sit directly on the board. Whoever physically reaches the hex first collects it. You can hold one at a time.</p>
            <div className="power-row">
              <span className="power-pill">S · Speed</span>
              <span className="power-pill rare">P · Phase Shift</span>
            </div>
            <p className="muted">Phase Shift can save you after the doomed color is revealed — but you only have 1.15 seconds.</p>
            <div className="modal-actions">
              {showIPhoneTip && (
                <button className="secondary" onClick={() => setShowInstall((shown) => !shown)}>
                  {showInstall ? "Hide mobile tip" : "Show me the mobile tip"}
                </button>
              )}
              <button className="primary" onClick={onDone}>I’m ready to play</button>
            </div>
            {showInstall && showIPhoneTip && (
              <div className="install-tip">
                <b>iPhone tip:</b> Tiles works directly in Safari. For more game space, tap Share → Add to Home Screen, then open Tiles from your Home Screen. This is optional.
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function Landing() {
  const [name, setName] = useState(() => localStorage.getItem("tiles:name") || "");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<"create" | "join" | null>(null);

  const saveName = () => {
    const clean = name.trim().slice(0, 16);
    if (!clean) throw new Error("Enter a display name first.");
    localStorage.setItem("tiles:name", clean);
    return clean;
  };

  async function createRoom() {
    try {
      setBusy("create");
      setError("");
      saveName();
      const response = await fetch("/api/rooms", { method: "POST" });
      const data = await response.json() as { roomCode?: string; error?: string };
      if (!response.ok || !data.roomCode) throw new Error(data.error || "Could not create room");
      location.href = `/room/${data.roomCode}`;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
      setBusy(null);
    }
  }

  async function joinRoom() {
    try {
      setBusy("join");
      setError("");
      saveName();
      const cleanCode = code.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 4);
      if (cleanCode.length !== 4) throw new Error("Enter the 4-character room code.");

      const response = await fetch(`/api/rooms/${cleanCode}`);
      if (!response.ok) throw new Error("That room does not exist.");
      location.href = `/room/${cleanCode}`;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
      setBusy(null);
    }
  }

  return (
    <main className="landing-shell">
      <div className="brand-lockup">
        <img className="brand-mark" src="/icons/icon.svg" alt="" />
        <span>TILES</span>
      </div>
      <h1 className="hero-title">Stay off the color that drops.</h1>
      <p className="hero-copy">A fast 2–5 player browser game built for phones, laptops, and people sitting around yelling at each other.</p>
      <div className="landing-card">
        <label>
          Display name
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={16}
            autoComplete="nickname"
            placeholder="Aidan"
          />
        </label>
        <button className="primary" onClick={createRoom} disabled={busy !== null}>
          {busy === "create" ? "Creating…" : "Create room"}
        </button>
        <div className="divider"><span>or join</span></div>
        <div className="join-row">
          <input
            value={code}
            onChange={(event) => setCode(event.target.value.toUpperCase())}
            onKeyDown={(event) => { if (event.key === "Enter" && !busy) void joinRoom(); }}
            maxLength={4}
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
            placeholder="K7PX"
            aria-label="Room code"
          />
          <button className="secondary" onClick={joinRoom} disabled={busy !== null}>
            {busy === "join" ? "Joining…" : "Join"}
          </button>
        </div>
        {error && <p className="error">{error}</p>}
      </div>
      <a className="apogee-link" href="https://apogeelab.org" target="_blank" rel="noreferrer">An Apogee Lab project ↗</a>
    </main>
  );
}

function Room({ roomCode }: { roomCode: string }) {
  const name = localStorage.getItem("tiles:name") || "Player";
  const socket = useMemo(() => new RoomSocket(roomCode, name), [roomCode, name]);
  const [state, setState] = useState<GameState | null>(null);
  const [myId, setMyId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [fatalError, setFatalError] = useState("");
  const [connection, setConnection] = useState<"connecting" | "connected" | "reconnecting" | "closed">("connecting");
  const [serverOffset, setServerOffset] = useState(0);
  const [, forceTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const offState = socket.onState((next, serverTime) => {
      setState(next);
      setMyId(socket.playerId);
      setServerOffset(serverTime - Date.now());
      setError("");
    });
    const offError = socket.onError((message) => {
      if (message === "This room is full" || message === "A match is already in progress") {
        setFatalError(message);
        socket.close();
        return;
      }
      setError(message);
    });
    const offConnection = socket.onConnection(setConnection);
    const timer = window.setInterval(() => forceTick((n) => n + 1), 100);

    void (async () => {
      try {
        const response = await fetch(`/api/rooms/${roomCode}`);
        if (!response.ok) throw new Error("This room does not exist or has expired.");
        if (!cancelled) socket.connect();
      } catch (e) {
        if (!cancelled) setFatalError(e instanceof Error ? e.message : "Could not open this room.");
      }
    })();

    return () => {
      cancelled = true;
      offState();
      offError();
      offConnection();
      window.clearInterval(timer);
      socket.close();
    };
  }, [roomCode, socket]);

  const me = state?.players.find((player) => player.id === myId) ?? null;
  const remainingMs = state?.phaseEndsAt
    ? Math.max(0, state.phaseEndsAt - (Date.now() + serverOffset))
    : 0;
  const seconds = Math.ceil(remainingMs / 1000);

  const move = useCallback((tileId: number) => socket.send({ type: "move", tileId }), [socket]);
  const choose = (color: TileColor) => socket.send({ type: "choose-color", color });
  const usePower = () => socket.send({ type: "use-powerup" });
  const ready = () => socket.send({ type: "ready", ready: !me?.ready });
  const start = () => socket.send({ type: "start-game" });

  if (fatalError) {
    return (
      <main className="loading error-screen">
        <div>
          <h1>Room unavailable</h1>
          <p>{fatalError}</p>
          <a className="primary link-as-button" href="/">Back to Tiles</a>
        </div>
      </main>
    );
  }

  if (!state && error) {
    return (
      <main className="loading error-screen">
        <div>
          <h1>Couldn’t join room {roomCode}</h1>
          <p>{error}</p>
          <a className="primary link-as-button" href="/">Back to Tiles</a>
        </div>
      </main>
    );
  }

  if (!state) return <main className="loading">Connecting to room {roomCode}…</main>;

  const aliveCount = state.players.filter((player) => player.alive).length;
  const connectedPlayers = state.players.filter((player) => player.connected);
  const selector = state.players.find((player) => player.id === state.selectorId);
  const canStart = connectedPlayers.length >= 2 && connectedPlayers.every((player) => player.ready || player.host);

  async function copyInvite() {
    const invite = `${location.origin}/room/${roomCode}`;
    try {
      await navigator.clipboard.writeText(invite);
      setError("Invite link copied.");
      window.setTimeout(() => setError(""), 1500);
    } catch {
      setError(invite);
    }
  }

  return (
    <main className="game-shell">
      <div className="orientation-hint">Rotate to landscape for the best layout — portrait still works.</div>
      <header className="game-header">
        <div>
          <span className="room-label">ROOM</span>
          <b className="room-code">{roomCode}</b>
        </div>
        <div className="phase-title">{state.message}</div>
        <div className="timer">{state.phaseEndsAt ? `${seconds}s` : `${aliveCount} alive`}</div>
      </header>

      {connection === "reconnecting" && <div className="connection-banner">Connection lost — reconnecting…</div>}

      <section className="game-layout">
        <aside className="power-panel">
          <div className="panel-title">POWER</div>
          {me?.powerup ? (
            <button className={`power-button ${me.powerup}`} onClick={usePower}>
              <span>{me.powerup === "phase" ? "P" : "S"}</span>
              {me.powerup === "phase" ? "PHASE SHIFT" : "SPEED"}
            </button>
          ) : (
            <div className="empty-power">No power-up</div>
          )}
          <div className="panel-note">Walk over a power-up to collect it.</div>
        </aside>

        <div className="board-wrap">
          <GameCanvas state={state} myPlayerId={myId} onTileClick={move} />
          {state.phase === "countdown" && <div className="center-overlay"><strong>{seconds}</strong><span>GET READY</span></div>}
          {state.phase === "selector-wheel" && <div className="center-overlay compact"><strong>◉</strong><span>Choosing selector…</span></div>}
          {state.phase === "selector-choice" && me?.id !== state.selectorId && <div className="center-overlay compact"><strong>{selector?.name ?? "Player"}</strong><span>is choosing a color…</span></div>}
          {state.phase === "selector-choice" && me?.id === state.selectorId && (
            <div className="selector-overlay">
              <div className="selector-title">YOU CONTROL THE FLOOR</div>
              <div className="selector-sub">Choose a color to drop</div>
              <div className="color-buttons">
                {TILE_COLORS.map((color) => (
                  <button key={color} className={`color-button ${color}`} onClick={() => choose(color)}>
                    {COLOR_LABELS[color]}
                  </button>
                ))}
              </div>
            </div>
          )}
          {state.phase === "reveal" && (
            <div className="drop-banner">
              {state.selectedColor?.toUpperCase()} DROPS <span>{(remainingMs / 1000).toFixed(1)}s</span>
            </div>
          )}
          {!me?.alive && state.phase !== "lobby" && state.phase !== "game-over" && <div className="spectator-badge">SPECTATING</div>}
        </div>

        <aside className="players-panel">
          <div className="panel-title">PLAYERS</div>
          {state.players.map((player) => (
            <div className={`player-row ${!player.alive ? "dead" : ""} ${!player.connected ? "offline" : ""}`} key={player.id}>
              <span className="player-dot">●</span>
              <span className="player-name">
                {player.name}{player.id === myId ? " (you)" : ""}{!player.connected ? " · reconnecting" : ""}
              </span>
              <span className="wins">🏆 {player.wins}</span>
            </div>
          ))}

          {state.phase === "lobby" && (
            <div className="lobby-actions">
              <button className={me?.ready ? "secondary active" : "secondary"} onClick={ready}>
                {me?.ready ? "Ready ✓" : "Ready"}
              </button>
              {me?.host && (
                <button className="primary" onClick={start} disabled={!canStart}>
                  {connectedPlayers.length < 2 ? "Need 2 players" : canStart ? "Start game" : "Waiting for ready"}
                </button>
              )}
            </div>
          )}

          {state.phase === "game-over" && me?.host && <button className="primary" onClick={start}>Play again</button>}
          <button className="link-button" onClick={copyInvite}>Copy invite link</button>
        </aside>
      </section>

      {error && <div className={`error-toast ${error === "Invite link copied." ? "success-toast" : ""}`}>{error}</div>}
    </main>
  );
}

export default function App() {
  const [introDone, setIntroDone] = useState(() => localStorage.getItem("tiles:intro") === "done");
  const room = currentRoomCode();
  const finishIntro = () => {
    localStorage.setItem("tiles:intro", "done");
    setIntroDone(true);
  };

  return (
    <>
      {!introDone && <Intro onDone={finishIntro} />}
      {room ? <Room roomCode={room} /> : <Landing />}
    </>
  );
}
