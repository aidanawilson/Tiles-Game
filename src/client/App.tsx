import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import type { GameState, PlayerColor, PlayerState, TileColor } from "../shared/types";
import { TILE_COLORS } from "../shared/types";
import { GameCanvas } from "./game/GameCanvas";
import { RoomSocket } from "./network/socket";

const TILE_HEX: Record<TileColor, string> = {
  red: "#ff5a57",
  orange: "#ff993c",
  yellow: "#ffd84f",
  green: "#5ce07a",
  blue: "#51b8ff",
  violet: "#a46cff",
};

const PLAYER_HEX: Record<PlayerColor, string> = {
  yellow: "#f4c63d",
  blue: "#54d8ff",
  red: "#ff625f",
  green: "#69dc72",
  pink: "#ff77c8",
};

function currentRoomCode() {
  const m = location.pathname.match(/^\/room\/([A-Z0-9]{4})$/i);
  return m ? m[1].toUpperCase() : null;
}

function roomIdentityKey(roomCode: string) {
  return `tiles:${roomCode}:identity:v3`;
}

function isTouchDevice() {
  return navigator.maxTouchPoints > 0 || matchMedia("(pointer: coarse)").matches;
}

function isIOSBrowser() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent);
}

function isStandalone() {
  return matchMedia?.("(display-mode: standalone)").matches || Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
}

function AudioController() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [muted, setMuted] = useState(() => localStorage.getItem("tiles:music:muted") === "yes");

  useEffect(() => {
    const audio = new Audio("/audio/retro-arcade-theme.mp3");
    audio.loop = true;
    audio.volume = 0.34;
    audio.muted = muted;
    audioRef.current = audio;
    const unlock = () => {
      void audio.play().catch(() => undefined);
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
    window.addEventListener("pointerdown", unlock, { once: true });
    window.addEventListener("keydown", unlock, { once: true });
    return () => {
      audio.pause();
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, []);

  useEffect(() => {
    if (audioRef.current) audioRef.current.muted = muted;
    localStorage.setItem("tiles:music:muted", muted ? "yes" : "no");
  }, [muted]);

  return (
    <button className="sound-toggle" type="button" onClick={() => setMuted((v) => !v)} aria-label={muted ? "Turn music on" : "Mute music"}>
      {muted ? "♪×" : "♪"}
    </button>
  );
}

function Intro({ onDone }: { onDone: () => void }) {
  const [page, setPage] = useState(0);
  const [showInstall, setShowInstall] = useState(false);
  const touch = isTouchDevice();
  const install = isIOSBrowser() && !isStandalone();

  return (
    <div className="tutorial-backdrop" role="dialog" aria-modal="true">
      <div className="tutorial-card">
        <div className="tutorial-scroll">
          <div className="pixel-kicker">HOW TO PLAY</div>
          {page === 0 ? (
            <>
              <h2>MOVE. SURVIVE. CHOOSE.</h2>
              <div className="tutorial-steps">
                <div>
                  <b>01</b>
                  <span>{touch ? "Tap" : "Click"} any reachable hex. Your character runs there automatically.</span>
                </div>
                <div>
                  <b>02</b>
                  <span>When movement locks, the selector wheel picks a surviving player.</span>
                </div>
                <div>
                  <b>03</b>
                  <span>That player chooses a color. Every tile of that color cracks and falls.</span>
                </div>
              </div>
            </>
          ) : (
            <>
              <h2>POWER UPS = ONE SLOT.</h2>
              <p>Race across the board to collect an item. The first character to physically reach it gets it. You can only hold one.</p>
              <div className="tutorial-power-grid">
                <span>⚡ SPEED</span>
                <span>✦ PHASE SHIFT</span>
              </div>
              <p className="tutorial-note">
                Phase Shift can save you after the doomed color appears, but you only have <strong>1.15 seconds</strong>. {touch ? "Tap the power-up button" : "Click the power-up button"} before the floor drops.
              </p>
              {install && (
                <button className="text-button" onClick={() => setShowInstall((v) => !v)}>
                  {showInstall ? "Hide iPhone tip" : "Show me how to use full-screen mode"}
                </button>
              )}
              {showInstall && install && (
                <div className="install-tip">
                  Safari: tap <b>Share</b> → <b>Add to Home Screen</b>. Tiles then opens like a web app with more room for the arena. Totally optional.
                </div>
              )}
            </>
          )}
        </div>
        <div className="tutorial-actions">
          {page === 0 ? (
            <>
              <button className="arcade-button ghost" onClick={onDone}>SKIP</button>
              <button className="arcade-button" onClick={() => setPage(1)}>NEXT</button>
            </>
          ) : (
            <>
              <button className="arcade-button ghost" onClick={() => setPage(0)}>BACK</button>
              <button className="arcade-button primary" onClick={onDone}>I'M READY</button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Brand() {
  return (
    <div className="tiles-logo" aria-label="Tiles">
      <span>T</span>
      <span>I</span>
      <span>L</span>
      <span>E</span>
      <span>S</span>
    </div>
  );
}

function Landing() {
  const [name, setName] = useState(() => localStorage.getItem("tiles:name") || "");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<"create" | "join" | null>(null);
  const [resumeRoom, setResumeRoom] = useState(() => localStorage.getItem("tiles:lastRoom") || "");

  const saveName = () => {
    const clean = name.trim().slice(0, 16);
    if (!clean) throw new Error("Enter a player name first.");
    localStorage.setItem("tiles:name", clean);
    return clean;
  };

  async function createRoom() {
    try {
      setBusy("create");
      setError("");
      saveName();
      const r = await fetch("/api/rooms", { method: "POST" });
      const d = await r.json() as { roomCode?: string; error?: string };
      if (!r.ok || !d.roomCode) throw new Error(d.error || "Could not create room");
      location.href = `/room/${d.roomCode}`;
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
      const c = code.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 4);
      if (c.length !== 4) throw new Error("Enter the 4-character room code.");
      const r = await fetch(`/api/rooms/${c}`);
      if (!r.ok) throw new Error("That room does not exist.");
      location.href = `/room/${c}`;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
      setBusy(null);
    }
  }

  async function resume() {
    if (!resumeRoom) return;
    try {
      setBusy("join");
      const r = await fetch(`/api/rooms/${resumeRoom}`);
      if (!r.ok) throw new Error("Your previous room has expired.");
      location.href = `/room/${resumeRoom}`;
    } catch (e) {
      localStorage.removeItem("tiles:lastRoom");
      setResumeRoom("");
      setError(e instanceof Error ? e.message : "Previous room unavailable");
      setBusy(null);
    }
  }

  return (
    <main className="landing-screen">
      <AudioController />
      <section className="landing-panel">
        <div className="arcade-spark spark-left" />
        <div className="arcade-spark spark-right" />
        <Brand />
        <div className="landing-rule" />
        <p className="landing-tagline">MOVE FAST · STAY UP · DROP THE FLOOR</p>
        <label className="arcade-label">
          PLAYER NAME
          <input value={name} onChange={(e: any) => setName(e.target.value)} maxLength={16} placeholder="PLAYER 1" />
        </label>
        <button className="big-action" onClick={createRoom} disabled={busy !== null}>
          {busy === "create" ? "CREATING..." : "CREATE GROUP"}
        </button>
        <div className="or-line"><span>OR JOIN WITH CODE</span></div>
        <div className="code-row">
          <input
            value={code}
            onChange={(e: any) => setCode(e.target.value.toUpperCase())}
            onKeyDown={(e: any) => { if (e.key === "Enter" && !busy) void joinRoom(); }}
            maxLength={4}
            placeholder="K7PX"
          />
          <button className="arcade-button secondary-action" onClick={joinRoom} disabled={busy !== null}>
            {busy === "join" ? "JOINING..." : "JOIN"}
          </button>
        </div>
        {error && <p className="landing-error">{error}</p>}
        {resumeRoom && (
          <button className="resume-button" onClick={resume} disabled={busy !== null}>
            RECONNECT TO ROOM {resumeRoom}
          </button>
        )}
        <div className="how-to-strip">
          <div><b>1.</b> STEP ON TILES</div>
          <div><b>2.</b> COLLECT POWER-UPS</div>
          <div><b>3.</b> LAST PLAYER WINS</div>
        </div>
        <div className="landing-rule" />
        <p className="landing-foot">2–5 PLAYERS · NO ACCOUNTS · ROOM CODE MULTIPLAYER</p>
        <a className="apogee-link" href="https://apogeelab.org" target="_blank" rel="noreferrer">APOGEE LAB ↗</a>
      </section>
    </main>
  );
}

function SelectorWheel({ state }: { state: GameState }) {
  const candidates = state.selectorCandidates.map((id) => state.players.find((p) => p.id === id)).filter(Boolean) as PlayerState[];
  const selector = state.players.find((p) => p.id === state.selectorId);
  if (!candidates.length || !selector) return null;
  const segment = 360 / candidates.length;
  const gradient = candidates.map((p, i) => `${PLAYER_HEX[p.color]} ${i * segment}deg ${(i + 1) * segment}deg`).join(",");
  const targetIndex = Math.max(0, candidates.findIndex((p) => p.id === selector.id));
  const finalRotation = 1440 + (360 - (targetIndex * segment + segment / 2));
  return (
    <div className="wheel-overlay">
      <div className="wheel-title">SELECTOR</div>
      <div className="wheel-pointer">▼</div>
      <div className="selector-wheel" style={{ background: `conic-gradient(from -90deg, ${gradient})`, "--wheel-final": `${finalRotation}deg` } as CSSProperties} />
    </div>
  );
}

function Room({ roomCode }: { roomCode: string }) {
  const name = localStorage.getItem("tiles:name") || "Player";
  localStorage.setItem("tiles:lastRoom", roomCode);
  const socket = useMemo(() => new RoomSocket(roomCode, name), [roomCode, name]);
  const [state, setState] = useState<GameState | null>(null);
  const [myId, setMyId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [fatal, setFatal] = useState("");
  const [connection, setConnection] = useState<"connecting" | "connected" | "reconnecting" | "closed">("connecting");
  const [serverOffset, setServerOffset] = useState(0);
  const [, tick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const a = socket.onState((next, t) => {
      setState(next);
      setMyId(socket.playerId);
      setServerOffset(t - Date.now());
      setError("");
    });
    const b = socket.onError((m) => {
      if (m === "This room is full" || m === "A match is already in progress") {
        setFatal(m);
        socket.close();
      } else setError(m);
    });
    const c = socket.onConnection(setConnection);
    const timer = setInterval(() => tick((n) => n + 1), 100);
    void (async () => {
      try {
        const r = await fetch(`/api/rooms/${roomCode}`);
        if (!r.ok) throw new Error("This room does not exist or has expired.");
        if (!cancelled) socket.connect();
      } catch (e) {
        if (!cancelled) setFatal(e instanceof Error ? e.message : "Could not open room");
      }
    })();
    return () => {
      cancelled = true;
      a(); b(); c();
      clearInterval(timer);
      socket.close();
    };
  }, [roomCode, socket]);

  const move = useCallback((tileId: number) => socket.send({ type: "move", tileId }), [socket]);

  if (fatal) return <main className="loading-screen"><Brand /><p>{fatal}</p><a href="/" className="arcade-button">BACK</a></main>;
  if (!state) return <main className="loading-screen"><Brand /><p>{error || `CONNECTING TO ${roomCode}...`}</p></main>;

  const me = state.players.find((p) => p.id === myId) || null;
  const connected = state.players.filter((p) => p.connected);
  const selector = state.players.find((p) => p.id === state.selectorId);
  const canStart = connected.length >= 2 && connected.every((p) => p.ready || p.host);
  const remaining = state.phaseEndsAt ? Math.max(0, state.phaseEndsAt - (Date.now() + serverOffset)) : 0;
  const countdown = Math.max(1, Math.ceil(remaining / 1000));

  const choose = (color: TileColor) => socket.send({ type: "choose-color", color });
  const usePower = () => socket.send({ type: "use-powerup" });
  const ready = () => socket.send({ type: "ready", ready: !me?.ready });
  const start = () => socket.send({ type: "start-game" });

  async function copyInvite() {
    const invite = `${location.origin}/room/${roomCode}`;
    try {
      await navigator.clipboard.writeText(invite);
      setError("INVITE COPIED");
      setTimeout(() => setError(""), 1400);
    } catch {
      setError(invite);
    }
  }

  function leaveRoom() {
    localStorage.removeItem("tiles:lastRoom");
    localStorage.removeItem(roomIdentityKey(roomCode));
    socket.send({ type: "leave-room" });
    window.setTimeout(() => {
      socket.close();
      location.href = "/";
    }, 80);
  }

  return (
    <main className="game-screen">
      <AudioController />
      <div className="rotate-hint">↻ LANDSCAPE IS RECOMMENDED FOR THE BEST VIEW</div>
      <header className="arcade-header">
        <div className="header-room header-badge"><small>ROOM</small><strong>{roomCode}</strong></div>
        <Brand />
        <div className="header-round header-badge"><small>ROUND</small><strong>{Math.max(1, state.round)}</strong></div>
      </header>
      {connection === "reconnecting" && <div className="connection-strip">RECONNECTING TO YOUR PLAYER...</div>}
      <section className="game-grid">
        <aside className="arcade-panel power-panel">
          <div className="panel-heading">POWER UP <span>1 SLOT</span></div>
          {me?.powerup ? (
            <button className={`power-card ${me.powerup}`} onClick={usePower}>
              <img src="/assets/powerups.png" alt="" />
              <b>{me.powerup === "phase" ? "PHASE SHIFT" : "SPEED"}</b>
              <small>{me.powerup === "phase" ? "TAP DURING DROP" : "TAP TO BOOST"}</small>
            </button>
          ) : (
            <div className="empty-slot"><div>+</div><span>EMPTY</span></div>
          )}
          <p>RUN OVER AN ITEM TO COLLECT IT. YOU CAN ONLY HOLD ONE.</p>
        </aside>

        <div className="arena-frame">
          <GameCanvas state={state} myPlayerId={myId} serverOffset={serverOffset} onTileClick={move} />
          {state.phase === "countdown" && <div className="round-overlay"><b>{countdown}</b><span>GET READY</span></div>}
          {state.phase === "selector-wheel" && <SelectorWheel state={state} />}
          {state.phase === "selector-choice" && me?.id === state.selectorId && (
            <div className="color-popup">
              <div className="popup-kicker">YOU CONTROL THE FLOOR</div>
              <h2>CHOOSE A COLOR TO DROP</h2>
              <div className="color-grid">
                {TILE_COLORS.map((c) => (
                  <button key={c} onClick={() => choose(c)} style={{ "--tile-color": TILE_HEX[c] } as CSSProperties}>
                    <span />
                    <b>{c.toUpperCase()}</b>
                  </button>
                ))}
              </div>
            </div>
          )}
          {state.phase === "selector-choice" && me?.id !== state.selectorId && (
            <div className="waiting-overlay">
              <strong style={{ color: selector ? PLAYER_HEX[selector.color] : undefined }}>{selector?.name.toUpperCase() || "PLAYER"}</strong>
              <span>IS CHOOSING...</span>
            </div>
          )}
          {state.phase === "reveal" && <div className="drop-callout" style={{ borderColor: state.selectedColor ? TILE_HEX[state.selectedColor] : undefined }}>{state.selectedColor?.toUpperCase()} DROPS!</div>}
          {state.phase === "results" && <div className="result-callout">{state.message.toUpperCase()}</div>}
          {state.phase === "game-over" && (
            <div className="winner-overlay">
              <span>MATCH OVER</span>
              <strong>{state.message.toUpperCase()}</strong>
              {me?.host && <button className="arcade-button primary" onClick={start}>REMATCH</button>}
            </div>
          )}
          {!me?.alive && !["lobby", "game-over"].includes(state.phase) && <div className="spectator-badge">SPECTATING</div>}
        </div>

        <aside className="arcade-panel players-panel">
          <div className="panel-heading">PLAYERS <span>{connected.length}/5</span></div>
          <div className="player-list">
            {state.players.map((p) => (
              <div key={p.id} className={`player-card ${!p.alive ? "dead" : ""} ${!p.connected ? "offline" : ""}`}>
                <img src={`/assets/characters/thumbs/${p.color}.png`} alt="" />
                <span className="color-chip" style={{ background: PLAYER_HEX[p.color] }} />
                <div>
                  <b>{p.name}{p.id === myId ? " · YOU" : ""}</b>
                  <small>{!p.connected ? "RECONNECTING" : !p.alive && state.phase !== "lobby" ? "ELIMINATED" : p.ready && state.phase === "lobby" ? "READY" : "IN GAME"}</small>
                </div>
                <strong>🏆 {p.wins}</strong>
              </div>
            ))}
          </div>
          {state.phase === "lobby" && (
            <div className="lobby-actions">
              <button className={`arcade-button ${me?.ready ? "ready" : ""}`} onClick={ready}>{me?.ready ? "READY ✓" : "READY"}</button>
              {me?.host && <button className="arcade-button primary" onClick={start} disabled={!canStart}>{connected.length < 2 ? "NEED 2 PLAYERS" : canStart ? "START GAME" : "WAITING FOR READY"}</button>}
            </div>
          )}
          <div className="utility-actions">
            <button className="invite-button" onClick={copyInvite}>COPY INVITE LINK</button>
            <button className="leave-button" onClick={leaveRoom}>LEAVE ROOM</button>
          </div>
        </aside>
      </section>
      {error && <div className="toast">{error}</div>}
    </main>
  );
}

export default function App() {
  const [introDone, setIntroDone] = useState(() => localStorage.getItem("tiles:intro:v3") === "done");
  const room = currentRoomCode();
  const done = () => {
    localStorage.setItem("tiles:intro:v3", "done");
    setIntroDone(true);
  };
  return <>{!introDone && <Intro onDone={done} />}{room ? <Room roomCode={room} /> : <Landing />}</>;
}
