import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import type { GameState, PlayerColor, PlayerState, RoomVisibility, TileColor } from "../shared/types";
import { TILE_COLORS } from "../shared/types";
import { GameCanvas } from "./game/GameCanvas";
import { RoomSocket } from "./network/socket";
const TILE_HEX: Record<TileColor, string> = { red: "#ff5a57", orange: "#ff993c", yellow: "#ffd84f", green: "#5ce07a", blue: "#51b8ff", violet: "#a46cff" };
const PLAYER_HEX: Record<PlayerColor, string> = { yellow: "#f4c63d", blue: "#54d8ff", red: "#ff625f", green: "#69dc72", pink: "#ff77c8" };
function currentRoomCode() { const m = location.pathname.match(/^\/room\/([A-Z0-9]{4})$/i); return m ? m[1].toUpperCase() : null; }
function roomIdentityKey(code: string) { return `tiles:${code}:identity:v3`; }
function isTouchDevice() { return navigator.maxTouchPoints > 0 || matchMedia("(pointer: coarse)").matches; }
function isIOSBrowser() { return /iPad|iPhone|iPod/.test(navigator.userAgent); }
function isStandalone() { return matchMedia?.("(display-mode: standalone)").matches || Boolean((navigator as Navigator & {
    standalone?: boolean;
}).standalone); }
function ViewportController() {
    useEffect(() => {
        const root = document.documentElement;
        const update = () => {
            const vv = window.visualViewport;
            const width = Math.max(320, vv?.width ?? window.innerWidth);
            const height = Math.max(240, vv?.height ?? window.innerHeight);
            const touch = isTouchDevice();
            const layout = touch && width <= 1100 ? (width > height ? "mobile-landscape" : "mobile-portrait") : "desktop";
            const design = layout === "mobile-landscape" ? { w: 844, h: 390 } : layout === "mobile-portrait" ? { w: 390, h: 760 } : { w: 1280, h: 760 };
            const fit = Math.max(.72, Math.min(1, width / design.w, height / design.h));
            root.dataset.tilesLayout = layout;
            root.dataset.tilesStandalone = isStandalone() ? "yes" : "no";
            root.style.setProperty("--viewport-width", `${width}px`);
            root.style.setProperty("--viewport-height", `${height}px`);
            root.style.setProperty("--ui-scale", fit.toFixed(4));
        };
        update();
        const vv = window.visualViewport;
        window.addEventListener("resize", update);
        window.addEventListener("orientationchange", update);
        vv?.addEventListener("resize", update);
        vv?.addEventListener("scroll", update);
        return () => {
            window.removeEventListener("resize", update);
            window.removeEventListener("orientationchange", update);
            vv?.removeEventListener("resize", update);
            vv?.removeEventListener("scroll", update);
        };
    }, []);
    return null;
}
function ParticleField() {
    const particles = useMemo(() => Array.from({ length: 20 }, (_, i) => ({
        id: i,
        top: 5 + Math.random() * 90,
        left: -18 - Math.random() * 45,
        delay: -Math.random() * 16,
        duration: 7 + Math.random() * 10,
        length: 12 + Math.random() * 26,
        color: ["#ff5a57", "#ff993c", "#ffd84f", "#5ce07a", "#51b8ff", "#a46cff"][i % 6],
        angle: -18 + Math.random() * 16,
    })), []);
    return <div className="particle-field" aria-hidden="true">{particles.map(p => <i key={p.id} style={{ "--particle-top": `${p.top}%`, "--particle-left": `${p.left}%`, "--particle-delay": `${p.delay}s`, "--particle-duration": `${p.duration}s`, "--particle-length": `${p.length}px`, "--particle-color": p.color, "--particle-angle": `${p.angle}deg` } as CSSProperties}/>)}</div>;
}
function AudioController() { const ref = useRef<HTMLAudioElement | null>(null); const [muted, setMuted] = useState(() => localStorage.getItem("tiles:music:muted") === "yes"); useEffect(() => { const a = new Audio("/audio/retro-arcade-theme.mp3"); a.loop = true; a.volume = .34; a.muted = muted; ref.current = a; const unlock = () => { void a.play().catch(() => undefined); window.removeEventListener("pointerdown", unlock); window.removeEventListener("keydown", unlock); }; window.addEventListener("pointerdown", unlock, { once: true }); window.addEventListener("keydown", unlock, { once: true }); return () => { a.pause(); window.removeEventListener("pointerdown", unlock); window.removeEventListener("keydown", unlock); }; }, []); useEffect(() => { if (ref.current)
    ref.current.muted = muted; localStorage.setItem("tiles:music:muted", muted ? "yes" : "no"); }, [muted]); return <button className="sound-toggle" type="button" onClick={() => setMuted(v => !v)} aria-label={muted ? "Turn music on" : "Mute music"}>{muted ? "♪×" : "♪"}</button>; }
function Brand() { return <div className="tiles-logo"><span className="logo-confetti confetti-left" aria-hidden="true"/><img src="/assets/tiles-logo.png" alt="Tiles"/><span className="logo-confetti confetti-right" aria-hidden="true"/></div>; }
function Intro({ onDone }: { onDone: () => void; }) {
    const [page, setPage] = useState(0);
    const [installTip, setInstallTip] = useState(false);
    const touch = isTouchDevice();
    const showInstall = touch && !isStandalone();
    return <div className="tutorial-backdrop" role="dialog" aria-modal="true">
        <div className="tutorial-card ornate-frame">
            <div className="tutorial-scroll">
                <Brand />
                {page === 0 ? <>
                    <div className="pixel-kicker">HOW TO PLAY</div>
                    <h2>STAY ON THE FLOOR.</h2>
                    <div className="tutorial-steps tutorial-steps-v2">
                        <div><b>1</b><span><strong>Tap a tile</strong> to move to it.</span><i className="tutorial-mini-hex selected"/></div>
                        <div><b>2</b><span><strong>Pick a color</strong> to eliminate.</span><i className="tutorial-color-dots"><em/><em/><em/></i></div>
                        <div><b>3</b><span><strong>Be the last one standing.</strong></span><img src="/assets/characters/thumbs/yellow.png" alt=""/></div>
                    </div>
                </> : <>
                    <div className="pixel-kicker">POWERUPS</div>
                    <h2>POWERUPS</h2>
                    <div className="tutorial-power-grid tutorial-power-grid-v2">
                        <div><PowerIcon type="speed"/><b>SPEED</b></div>
                        <div><PowerIcon type="bubble"/><b>BUBBLE</b></div>
                        <div><PowerIcon type="phase"/><b>PHASE SHIFT</b></div>
                    </div>
                    <p className="tutorial-note">Pick up powerups while you move, and click them to activate them.</p>
                    {showInstall && <div className="install-callout">
                        <button className="install-toggle" onClick={() => setInstallTip(v => !v)}>
                            <span>ADD TO HOME SCREEN FOR BETTER GAMEPLAY</span>
                            <strong>{installTip ? "HIDE" : "SHOW ME HOW"}</strong>
                        </button>
                        {installTip && <div className="install-tip">{isIOSBrowser() ? <>In Safari, tap <strong>Share</strong> → <strong>Add to Home Screen</strong> → <strong>Add</strong>. Tiles will launch with more usable screen space.</> : <>Open your browser menu and choose <strong>Add to Home screen</strong> or <strong>Install app</strong>. Then launch Tiles from your home screen for more usable space.</>}</div>}
                    </div>}
                </>}
            </div>
            <div className={`tutorial-actions tutorial-actions-v2 page-${page + 1}`}>
                {page === 0 ? <>
                    <button className="arcade-button ghost" onClick={onDone}>SKIP</button>
                    <div className="tutorial-next-cluster"><button className="arcade-button primary" onClick={() => setPage(1)}>NEXT</button><div className="tutorial-mascot point"><img src="/assets/characters/thumbs/yellow.png" alt=""/><span>◀</span></div></div>
                </> : <>
                    <button className="arcade-button ghost" onClick={() => setPage(0)}>BACK</button>
                    <div className="tutorial-next-cluster final"><button className="arcade-button primary" onClick={onDone}>LET'S GO</button><div className="tutorial-mascot sit"><img src="/assets/characters/thumbs/pink.png" alt=""/></div></div>
                </>}
            </div>
        </div>
    </div>;
}
function FloatingArcadeArt() { const items: [PlayerColor, string, string][] = [["yellow", "float-a", "40%"], ["blue", "float-b", "80%"], ["pink", "float-c", "100%"], ["green", "float-d", "60%"]]; return <div className="landing-floats" aria-hidden="true">{items.map(([c, k, row], i) => <div className={`floating-island ${k}`} key={k} style={{ "--float-color": PLAYER_HEX[c], "--delay": `${i * -.7}s`, "--tile-row": row } as CSSProperties}><img src={`/assets/characters/thumbs/${c}.png`} alt=""/><span className="decor-hex"/></div>)}</div>; }
function Landing() {
    const [name, setName] = useState(() => localStorage.getItem("tiles:name") || "");
    const [code, setCode] = useState("");
    const [error, setError] = useState("");
    const [busy, setBusy] = useState<"quick" | "create" | "join" | null>(null);
    const [resumeRoom, setResumeRoom] = useState(() => localStorage.getItem("tiles:lastRoom") || "");
    const [createOpen, setCreateOpen] = useState(false);
    const [visibility, setVisibility] = useState<RoomVisibility>("public");
    const [bots, setBots] = useState(true);
    const saveName = () => { const clean = name.trim().slice(0, 16); if (!clean)
        throw new Error("Enter a player name first."); localStorage.setItem("tiles:name", clean); return clean; };
    async function quickPlay() { try {
        setBusy("quick");
        setError("");
        saveName();
        const r = await fetch("/api/quick-play", { method: "POST" });
        const d = await r.json() as {
            roomCode?: string;
            error?: string;
        };
        if (!r.ok || !d.roomCode)
            throw new Error(d.error || "Could not find a match");
        localStorage.setItem(`tiles:autoReady:${d.roomCode}`, "yes");
        location.href = `/room/${d.roomCode}`;
    }
    catch (e) {
        setError(e instanceof Error ? e.message : "Something went wrong");
        setBusy(null);
    } }
    async function createRoom() { try {
        setBusy("create");
        setError("");
        saveName();
        const r = await fetch("/api/rooms", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ visibility, botsEnabled: visibility === "public" ? true : bots }) });
        const d = await r.json() as {
            roomCode?: string;
            error?: string;
        };
        if (!r.ok || !d.roomCode)
            throw new Error(d.error || "Could not create room");
        location.href = `/room/${d.roomCode}`;
    }
    catch (e) {
        setError(e instanceof Error ? e.message : "Something went wrong");
        setBusy(null);
    } }
    async function joinRoom() { try {
        setBusy("join");
        setError("");
        saveName();
        const c = code.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 4);
        if (c.length !== 4)
            throw new Error("Enter the 4-character room code.");
        const r = await fetch(`/api/rooms/${c}`);
        if (!r.ok)
            throw new Error("That room does not exist.");
        location.href = `/room/${c}`;
    }
    catch (e) {
        setError(e instanceof Error ? e.message : "Something went wrong");
        setBusy(null);
    } }
    async function resume() { if (!resumeRoom)
        return; try {
        setBusy("join");
        const r = await fetch(`/api/rooms/${resumeRoom}`);
        if (!r.ok)
            throw new Error("Your previous room has expired.");
        location.href = `/room/${resumeRoom}`;
    }
    catch (e) {
        localStorage.removeItem("tiles:lastRoom");
        setResumeRoom("");
        setError(e instanceof Error ? e.message : "Previous room unavailable");
        setBusy(null);
    } }
    return <main className="landing-screen"><AudioController /><FloatingArcadeArt /><section className="landing-panel"><Brand /><div className="landing-rule"/><p className="landing-tagline">MOVE FAST · STAY UP · DROP THE FLOOR</p><label className="arcade-label">PLAYER NAME<input value={name} onChange={(e: any) => setName(e.target.value)} maxLength={16} placeholder="PLAYER 1"/></label><button className="big-action quick-action" onClick={quickPlay} disabled={busy !== null}>{busy === "quick" ? "MATCHING..." : "QUICK PLAY"}</button><button className="arcade-button create-toggle" onClick={() => setCreateOpen(v => !v)} disabled={busy !== null}>CREATE GROUP</button>{createOpen && <div className="create-options"><div className="option-title">VISIBILITY</div><div className="segmented"><button className={visibility === "public" ? "selected" : ""} onClick={() => setVisibility("public")}>PUBLIC</button><button className={visibility === "private" ? "selected" : ""} onClick={() => setVisibility("private")}>PRIVATE</button></div>{visibility === "private" && <label className="bot-toggle"><span>FILL WITH BOTS</span><button className={bots ? "on" : ""} onClick={() => setBots(v => !v)}>{bots ? "ON" : "OFF"}</button></label>}<button className="arcade-button primary create-confirm" onClick={createRoom} disabled={busy !== null}>{busy === "create" ? "CREATING..." : "CREATE ROOM"}</button></div>}<div className="or-line"><span>JOIN WITH CODE</span></div><div className="code-row"><input value={code} onChange={(e: any) => setCode(e.target.value.toUpperCase())} onKeyDown={(e: any) => { if (e.key === "Enter" && !busy)
        void joinRoom(); }} maxLength={4} placeholder="K7PX"/><button className="arcade-button secondary-action" onClick={joinRoom} disabled={busy !== null}>{busy === "join" ? "JOINING..." : "JOIN"}</button></div>{error && <p className="landing-error">{error}</p>}{resumeRoom && <button className="resume-button" onClick={resume} disabled={busy !== null}>RECONNECT TO ROOM {resumeRoom}</button>}<div className="how-to-strip"><div><b>1.</b> STEP ON TILES</div><div><b>2.</b> COLLECT POWER-UPS</div><div><b>3.</b> LAST PLAYER WINS</div></div><div className="landing-rule"/><a className="apogee-link" href="https://apogeelab.org" target="_blank" rel="noreferrer"><img src="/assets/apogee-lab-logo.png" alt=""/><span>APOGEE LAB © ↗</span></a></section></main>;
}
function SelectorWheel({ state }: {
    state: GameState;
}) { const candidates = state.selectorCandidates.map(id => state.players.find(p => p.id === id)).filter(Boolean) as PlayerState[]; const selector = state.players.find(p => p.id === state.selectorId); if (!candidates.length || !selector)
    return null;
    const segment = 360 / candidates.length;
    const gradient = candidates.map((p, i) => `${PLAYER_HEX[p.color]} ${i * segment}deg ${(i + 1) * segment}deg`).join(",");
    const target = Math.max(0, candidates.findIndex(p => p.id === selector.id));

    // The conic gradient starts at -90deg (the left side), while the fixed pointer
    // sits at 0deg (12 o'clock). Rotate the authoritative selector's wedge center
    // exactly under that pointer. Keeping the target derived from selectorId means
    // the animation can never independently choose a different player.
    const targetCenter = target * segment + segment / 2;
    const pointerCorrection = (90 - targetCenter + 360) % 360;
    const rot = 1440 + pointerCorrection;

    return <div className="wheel-overlay"><div className="wheel-title">SELECTOR</div><div className="wheel-pointer">▼</div><div className="selector-wheel" style={{ background: `conic-gradient(from -90deg, ${gradient})`, "--wheel-final": `${rot}deg` } as CSSProperties}/></div>; }
function PlayerCard({ p, myId, state }: {
    p: PlayerState;
    myId: string | null;
    state: GameState;
}) { const status = !p.connected ? "RECONNECTING" : !p.alive && !['lobby', 'game-over'].includes(state.phase) ? "ELIMINATED" : p.ready && ['lobby', 'game-over'].includes(state.phase) ? "READY" : state.phase === "countdown" ? "LOCKED IN" : "IN GAME"; return <div className={`player-card ${!p.alive ? "dead" : ""} ${!p.connected ? "offline" : ""}`} style={{ "--player-color": PLAYER_HEX[p.color] } as CSSProperties}><img src={`/assets/characters/thumbs/${p.color}.png`} alt=""/><div><b><span className="name-dot"/>{p.name}{p.id === myId ? " · YOU" : ""}</b><small>{status}</small></div><strong>🏆 {p.wins}</strong></div>; }
function PowerIcon({ type }: {
    type: "speed" | "bubble" | "phase";
}) { if (type === "bubble")
    return <span className="bubble-power-icon"/>; return <img src="/assets/powerups.png" alt="" style={{ objectPosition: type === "phase" ? "33.333% center" : "left center" }}/>; }
function Room({ roomCode }: {
    roomCode: string;
}) {
    const name = localStorage.getItem("tiles:name") || "Player";
    localStorage.setItem("tiles:lastRoom", roomCode);
    const socket = useMemo(() => new RoomSocket(roomCode, name), [roomCode, name]);
    const [state, setState] = useState<GameState | null>(null);
    const [myId, setMyId] = useState<string | null>(null);
    const [error, setError] = useState("");
    const [toast, setToast] = useState("");
    const [fatal, setFatal] = useState("");
    const [connection, setConnection] = useState<"connecting" | "connected" | "reconnecting" | "closed">("connecting");
    const [serverOffset, setServerOffset] = useState(0);
    const [, tick] = useState(0);
    const autoReadySent = useRef(false);
    useEffect(() => { let cancelled = false; const a = socket.onState((next, t) => { setState(next); setMyId(socket.playerId); setServerOffset(t - Date.now()); setError(""); }); const b = socket.onError(m => { if (m === "This room is full" || m === "A match is already in progress") {
        setFatal(m);
        socket.close();
    }
    else
        setError(m); }); const c = socket.onConnection(setConnection); const timer = setInterval(() => tick(n => n + 1), 100); void (async () => { try {
        const r = await fetch(`/api/rooms/${roomCode}`);
        if (!r.ok)
            throw new Error("This room does not exist or has expired.");
        if (!cancelled)
            socket.connect();
    }
    catch (e) {
        if (!cancelled)
            setFatal(e instanceof Error ? e.message : "Could not open room");
    } })(); return () => { cancelled = true; a(); b(); c(); clearInterval(timer); socket.close(); }; }, [roomCode, socket]);
    useEffect(() => { if (!state || !myId || autoReadySent.current)
        return; if (localStorage.getItem(`tiles:autoReady:${roomCode}`) === "yes") {
        autoReadySent.current = true;
        localStorage.removeItem(`tiles:autoReady:${roomCode}`);
        socket.send({ type: "ready", ready: true });
    } }, [state, myId, roomCode, socket]);
    const move = useCallback((tileId: number) => socket.send({ type: "move", tileId }), [socket]);
    if (fatal)
        return <main className="loading-screen"><Brand /><p>{fatal}</p><a href="/" className="arcade-button">BACK</a></main>;
    if (!state)
        return <main className="loading-screen"><Brand /><p>{error || `CONNECTING TO ${roomCode}...`}</p></main>;
    const me = state.players.find(p => p.id === myId) || null, selector = state.players.find(p => p.id === state.selectorId);
    const remaining = state.phaseEndsAt ? Math.max(0, state.phaseEndsAt - (Date.now() + serverOffset)) : 0;
    const countdown = Math.max(1, Math.ceil(remaining / 1000));
    const choose = (color: TileColor) => socket.send({ type: "choose-color", color });
    const usePower = () => socket.send({ type: "use-powerup" });
    const ready = () => socket.send({ type: "ready", ready: !me?.ready });
    async function copyCode() { try {
        await navigator.clipboard.writeText(roomCode);
        setToast("COPIED TO CLIPBOARD");
        window.setTimeout(() => setToast(""), 1000);
    }
    catch {
        setToast(roomCode);
        window.setTimeout(() => setToast(""), 1000);
    } }
    function leaveRoom() { localStorage.removeItem("tiles:lastRoom"); localStorage.removeItem(roomIdentityKey(roomCode)); socket.send({ type: "leave-room" }); window.setTimeout(() => { socket.close(); location.href = "/"; }, 80); }
    const pType = me?.powerup;
    const powerName = pType === "phase" ? "PHASE SHIFT" : pType === "bubble" ? "BUBBLE" : "SPEED";
    const powerHint = pType === "phase" ? "TAP DURING DROP" : pType === "bubble" ? "TAP FOR 4 SEC" : "TAP TO BOOST";
    return <main className="game-screen"><AudioController /><header className="arcade-header ornate-frame"><button className="header-room room-copy" onClick={copyCode} aria-label={`Copy room code ${roomCode}`}><small>ROOM</small><strong>{roomCode}</strong></button><Brand /><div className="header-round header-badge"><small>ROUND</small><strong>{Math.max(1, state.round)}</strong></div></header>{connection === "reconnecting" && <div className="connection-strip">RECONNECTING TO YOUR PLAYER...</div>}<section className="game-grid"><aside className="arcade-panel power-panel ornate-frame"><div className="panel-heading">POWER UP <span>1 SLOT</span></div>{pType ? <button className={`power-card ${pType}`} onClick={usePower}><PowerIcon type={pType}/><b>{powerName}</b><small>{powerHint}</small></button> : <div className="empty-slot"><div>+</div><span>EMPTY</span></div>}<p>RUN OVER AN ITEM TO COLLECT IT. YOU CAN ONLY HOLD ONE.</p></aside><div className="arena-frame ornate-frame"><GameCanvas state={state} myPlayerId={myId} serverOffset={serverOffset} onTileClick={move}/>{state.phase === "countdown" && <div className="round-overlay"><b>{countdown}</b><span>GAME STARTING</span></div>}{state.phase === "selector-wheel" && <SelectorWheel state={state}/>} {state.phase === "selector-choice" && me?.id === state.selectorId && <div className="color-popup"><div className="popup-kicker">YOU CONTROL THE FLOOR</div><h2>CHOOSE A COLOR TO DROP</h2><div className="color-grid">{TILE_COLORS.map(c => <button key={c} onClick={() => choose(c)} style={{ "--tile-color": TILE_HEX[c] } as CSSProperties}><span /><b>{c.toUpperCase()}</b></button>)}</div></div>}{state.phase === "selector-choice" && me?.id !== state.selectorId && <div className="waiting-overlay"><strong style={{ color: selector ? PLAYER_HEX[selector.color] : undefined }}>{selector?.name.toUpperCase() || "PLAYER"}</strong><span>IS CHOOSING...</span></div>}{state.phase === "reveal" && <div className="drop-callout" style={{ borderColor: state.selectedColor ? TILE_HEX[state.selectedColor] : undefined }}>{state.selectedColor?.toUpperCase()} DROPS!</div>}{state.phase === "results" && <div className="result-callout">{state.message.toUpperCase()}</div>}{state.phase === "game-over" && <div className="winner-overlay"><span>MATCH OVER</span><strong>{state.message.toUpperCase()}</strong><button className={`arcade-button ${me?.ready ? "ready" : "primary"}`} onClick={ready}>{me?.ready ? "READY ✓" : "READY FOR REMATCH"}</button></div>}{!me?.alive && !['lobby', 'game-over'].includes(state.phase) && <div className="spectator-badge">SPECTATING</div>}</div><aside className="arcade-panel players-panel ornate-frame"><div className="panel-heading">PLAYERS <span>{state.players.length}/5</span></div><div className="player-list">{state.players.map(p => <PlayerCard key={p.id} p={p} myId={myId} state={state}/>)}</div>{state.phase === "lobby" && <div className="desktop-lobby-actions"><button className={`arcade-button ${me?.ready ? "ready" : ""}`} onClick={ready}>{me?.ready ? "READY ✓" : "READY"}</button><div className="lobby-status">{state.room.startCommitted ? "START LOCKED" : me?.ready ? "WAITING FOR PLAYERS" : "READY WHEN YOU ARE"}</div></div>}<button className="leave-button desktop-leave" onClick={leaveRoom}>LEAVE ROOM</button></aside></section>{["lobby", "game-over"].includes(state.phase) && <div className="mobile-actionbar"><button className={`arcade-button ${me?.ready ? "ready" : ""}`} onClick={ready}>{me?.ready ? "READY ✓" : state.phase === "game-over" ? "READY REMATCH" : "READY"}</button><button className="leave-button" onClick={leaveRoom}>LEAVE ROOM</button></div>}{state.phase !== "lobby" && state.phase !== "game-over" && <button className="mobile-leave-float" onClick={leaveRoom}>LEAVE</button>}{(error || toast) && <div className="toast">{toast || error}</div>}</main>;
}
export default function App() { const [introDone, setIntroDone] = useState(() => localStorage.getItem("tiles:intro:v5") === "done"); const room = currentRoomCode(); const done = () => { localStorage.setItem("tiles:intro:v5", "done"); setIntroDone(true); }; return <><ViewportController/><ParticleField/>{!introDone && <Intro onDone={done}/>} {room ? <Room roomCode={room}/> : <Landing />}</>; }

