import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { MOVEMENT_PHASE_MS, PRE_ROUND_COUNTDOWN_MS, REVEAL_WINDOW_MS, ROUND_SHUFFLE_MS, SELECTOR_WHEEL_MS } from "../shared/constants";
import type { GameState, PlayerColor, PlayerState, PowerupType, RoomVisibility, TileColor } from "../shared/types";
import { TILE_COLORS } from "../shared/types";
import { preloadSfx, playSfx } from "./audio";
import { GameCanvas } from "./game/GameCanvas";
import { RoomSocket } from "./network/socket";

const TILE_HEX: Record<TileColor, string> = { red: "#ff5a57", orange: "#ff993c", yellow: "#ffd84f", green: "#5ce07a", blue: "#51b8ff", violet: "#a46cff" };
const PLAYER_HEX: Record<PlayerColor, string> = { yellow: "#f4c63d", blue: "#54d8ff", red: "#ff625f", green: "#69dc72", pink: "#ff77c8" };
const SETTINGS_EVENT = "tiles:settings-change";
const FINAL_TWO_EVENT = "tiles:final-two-change";
const FINAL_TWO_TEMPO_RATIO = 141.048 / 126.048;

function currentRoomCode() { const m = location.pathname.match(/^\/room\/([A-Z0-9]{4})$/i); return m ? m[1].toUpperCase() : null; }
function roomIdentityKey(code: string) { return `tiles:${code}:identity:v3`; }
function isTouchDevice() { return navigator.maxTouchPoints > 0 || matchMedia("(pointer: coarse)").matches; }
function isIOSBrowser() { return /iPad|iPhone|iPod/.test(navigator.userAgent); }
function isStandalone() { return matchMedia?.("(display-mode: standalone)").matches || Boolean((navigator as Navigator & { standalone?: boolean }).standalone); }
function getSetting(key: "music" | "sfx" | "haptics", fallback = true) { const raw = localStorage.getItem(`tiles:settings:${key}`); return raw == null ? fallback : raw === "on"; }
function setSetting(key: "music" | "sfx" | "haptics", value: boolean) { localStorage.setItem(`tiles:settings:${key}`, value ? "on" : "off"); window.dispatchEvent(new CustomEvent(SETTINGS_EVENT)); }
function canVibrate() { return typeof navigator.vibrate === "function"; }
function haptic(pattern: number | number[]) { if (getSetting("haptics") && canVibrate()) navigator.vibrate(pattern); }

let audioContext: AudioContext | null = null;
function ctx() { if (!audioContext) audioContext = new AudioContext(); if (audioContext.state === "suspended") void audioContext.resume(); return audioContext; }
function tone(frequency: number, duration = .07, volume = .035, kind: OscillatorType = "square", endFrequency?: number) {
  if (!getSetting("sfx")) return;
  try {
    const c = ctx(), o = c.createOscillator(), g = c.createGain(), t = c.currentTime;
    o.type = kind; o.frequency.setValueAtTime(frequency, t); if (endFrequency) o.frequency.exponentialRampToValueAtTime(Math.max(20, endFrequency), t + duration);
    g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(volume, t + .008); g.gain.exponentialRampToValueAtTime(.0001, t + duration);
    o.connect(g); g.connect(c.destination); o.start(t); o.stop(t + duration + .02);
  } catch { /* audio is enhancement-only */ }
}
function wheelTick(strong = false) { tone(strong ? 250 : 185, strong ? .09 : .035, strong ? .045 : .018, "square", strong ? 145 : 150); }
function countdownBeep(go = false) { tone(go ? 620 : 390, go ? .15 : .065, go ? .055 : .032, "square", go ? 760 : 350); haptic(go ? 42 : 14); }

function ViewportController() {
  useEffect(() => {
    const root = document.documentElement;
    const update = () => {
      const vv = window.visualViewport;
      const width = Math.max(320, vv?.width ?? window.innerWidth), height = Math.max(240, vv?.height ?? window.innerHeight);
      const touch = isTouchDevice();
      const layout = touch && width <= 1100 ? (width > height ? "mobile-landscape" : "mobile-portrait") : "desktop";
      const design = layout === "mobile-landscape" ? { w: 844, h: 390 } : layout === "mobile-portrait" ? { w: 390, h: 760 } : { w: 1280, h: 760 };
      const fit = Math.max(.68, Math.min(1, width / design.w, height / design.h));
      root.dataset.tilesLayout = layout; root.dataset.tilesStandalone = isStandalone() ? "yes" : "no";
      root.style.setProperty("--viewport-width", `${width}px`); root.style.setProperty("--viewport-height", `${height}px`); root.style.setProperty("--ui-scale", fit.toFixed(4));
    };
    update();
    const vv = window.visualViewport;
    window.addEventListener("resize", update); window.addEventListener("orientationchange", update); vv?.addEventListener("resize", update); vv?.addEventListener("scroll", update);
    return () => { window.removeEventListener("resize", update); window.removeEventListener("orientationchange", update); vv?.removeEventListener("resize", update); vv?.removeEventListener("scroll", update); };
  }, []);
  return null;
}

function ParticleField() {
  const streaks = useMemo(() => Array.from({ length: 30 }, (_, i) => ({ id: i, top: 3 + Math.random() * 94, left: -22 - Math.random() * 48, delay: -Math.random() * 18, duration: 6 + Math.random() * 11, length: 10 + Math.random() * 28, color: ["#ff5a57", "#ff993c", "#ffd84f", "#5ce07a", "#51b8ff", "#a46cff"][i % 6], angle: -21 + Math.random() * 18 })), []);
  const stars = useMemo(() => Array.from({ length: 18 }, (_, i) => ({ id: i, top: 5 + Math.random() * 88, left: -15 + Math.random() * 100, delay: -Math.random() * 16, duration: 8 + Math.random() * 12, color: i % 4 === 0 ? ["#ff993c", "#ffd84f", "#5ce07a", "#51b8ff", "#a46cff"][i % 5] : "#d8efff" })), []);
  return <div className="particle-field" aria-hidden="true">
    {streaks.map(p => <i className="shooting-pixel" key={`s${p.id}`} style={{ "--particle-top": `${p.top}%`, "--particle-left": `${p.left}%`, "--particle-delay": `${p.delay}s`, "--particle-duration": `${p.duration}s`, "--particle-length": `${p.length}px`, "--particle-color": p.color, "--particle-angle": `${p.angle}deg` } as CSSProperties}/>)}
    {stars.map(p => <i className="pixel-star" key={`x${p.id}`} style={{ "--star-top": `${p.top}%`, "--star-left": `${p.left}%`, "--star-delay": `${p.delay}s`, "--star-duration": `${p.duration}s`, "--star-color": p.color } as CSSProperties}/>)}
  </div>;
}

function MusicController() {
  const normalRef = useRef<HTMLAudioElement | null>(null), finalRef = useRef<HTMLAudioElement | null>(null), finalMode = useRef(false), unlocked = useRef(false);
  useEffect(() => {
    preloadSfx();
    const normal = new Audio("/audio/retro-arcade-theme.mp3"), final = new Audio("/audio/retro-arcade-theme-final-two.mp3");
    normal.loop = final.loop = true; normal.volume = .34; final.volume = 0; normalRef.current = normal; finalRef.current = final;
    const musicOn = () => getSetting("music");
    const start = () => { unlocked.current = true; if (musicOn()) void (finalMode.current ? final : normal).play().catch(() => undefined); };
    const crossfade = (toFinal: boolean) => {
      finalMode.current = toFinal; if (!unlocked.current || !musicOn()) return;
      const from = toFinal ? normal : final, to = toFinal ? final : normal;
      if (toFinal) to.currentTime = ((normal.currentTime / FINAL_TWO_TEMPO_RATIO) % Math.max(.1, to.duration || 9999));
      else to.currentTime = ((final.currentTime * FINAL_TWO_TEMPO_RATIO) % Math.max(.1, to.duration || 9999));
      to.volume = 0; void to.play().catch(() => undefined);
      const steps = 10; let i = 0;
      const id = window.setInterval(() => { i++; const t = i / steps; from.volume = .34 * (1 - t); to.volume = .34 * t; if (i >= steps) { clearInterval(id); from.pause(); from.volume = .34; to.volume = .34; } }, 30);
    };
    const finalHandler = (event: Event) => crossfade(Boolean((event as CustomEvent<{ active: boolean }>).detail?.active));
    const settingsHandler = () => { if (!musicOn()) { normal.pause(); final.pause(); } else if (unlocked.current) void (finalMode.current ? final : normal).play().catch(() => undefined); };
    const unlock = () => { start(); window.removeEventListener("pointerdown", unlock); window.removeEventListener("keydown", unlock); };
    window.addEventListener("pointerdown", unlock, { once: true }); window.addEventListener("keydown", unlock, { once: true }); window.addEventListener(FINAL_TWO_EVENT, finalHandler); window.addEventListener(SETTINGS_EVENT, settingsHandler);
    return () => { normal.pause(); final.pause(); window.removeEventListener("pointerdown", unlock); window.removeEventListener("keydown", unlock); window.removeEventListener(FINAL_TWO_EVENT, finalHandler); window.removeEventListener(SETTINGS_EVENT, settingsHandler); };
  }, []);
  return null;
}

function Brand() { return <div className="tiles-logo"><span className="logo-confetti confetti-left" aria-hidden="true"/><img src="/assets/tiles-logo.png" alt="Tiles"/><span className="logo-confetti confetti-right" aria-hidden="true"/></div>; }
function PowerIcon({ type }: { type: PowerupType }) { return <span className={`power-sprite power-${type}`} aria-hidden="true"/>; }
function PixelDigits({ text, className = "", label }: { text: string; className?: string; label?: string }) { const map = "0123456789."; return <span className={`pixel-timer ${className}`} aria-label={label ?? text}>{[...text].map((ch, i) => <i key={`${i}-${ch}`} style={{ "--digit-x": `${-Math.max(0, map.indexOf(ch)) * 27}px` } as CSSProperties}/>)}</span>; }
function PixelTimer({ ms, className = "" }: { ms: number; className?: string }) { const value = (Math.max(0, ms) / 1000).toFixed(1); return <PixelDigits text={value} className={className} label={`${value} seconds`}/>; }

function Intro({ onDone }: { onDone: () => void }) {
  const [page, setPage] = useState(0), [installTip, setInstallTip] = useState(false); const showInstall = isTouchDevice() && !isStandalone();
  return <div className="tutorial-backdrop" role="dialog" aria-modal="true"><div className="tutorial-card ornate-frame"><div className="tutorial-scroll"><Brand/>{page === 0 ? <><div className="pixel-kicker">HOW TO PLAY</div><h2>STAY ON THE FLOOR.</h2><div className="tutorial-steps tutorial-steps-v2"><div><b>1</b><span><strong>Tap a tile</strong> to move to it.</span><i className="tutorial-mini-hex selected"/></div><div><b>2</b><span><strong>Pick a color</strong> to eliminate.</span><i className="tutorial-color-dots"><em/><em/><em/></i></div><div><b>3</b><span><strong>Be the last one standing.</strong></span><img src="/assets/characters/thumbs/yellow.png" alt=""/></div></div></> : <><div className="pixel-kicker">POWERUPS</div><h2>POWERUPS</h2><div className="tutorial-power-grid tutorial-power-grid-v2"><div><PowerIcon type="invisibility"/><b>INVISIBILITY</b></div><div><PowerIcon type="override"/><b>OVERRIDE</b></div><div><PowerIcon type="phase"/><b>PHASE SHIFT</b></div></div><p className="tutorial-note">Pick up powerups while you move, and click them to activate them.</p>{showInstall && <div className="install-callout"><button className="install-toggle" onClick={() => setInstallTip(v => !v)}><span>ADD TO HOME SCREEN FOR BETTER GAMEPLAY</span><strong>{installTip ? "HIDE" : "SHOW ME HOW"}</strong></button>{installTip && <div className="install-tip">{isIOSBrowser() ? <>In Safari, tap <strong>Share</strong> → <strong>Add to Home Screen</strong> → <strong>Add</strong>. Tiles will launch with more usable screen space.</> : <>Open your browser menu and choose <strong>Add to Home screen</strong> or <strong>Install app</strong>.</>}</div>}</div>}</>}</div><div className={`tutorial-actions tutorial-actions-v2 page-${page + 1}`}>{page === 0 ? <><button className="arcade-button ghost" onClick={onDone}>SKIP</button><div className="tutorial-next-cluster"><button className="arcade-button primary" onClick={() => setPage(1)}>NEXT</button><div className="tutorial-mascot point"><img src="/assets/characters/thumbs/yellow.png" alt=""/><span>◀</span></div></div></> : <><button className="arcade-button ghost" onClick={() => setPage(0)}>BACK</button><div className="tutorial-next-cluster final"><button className="arcade-button primary" onClick={onDone}>LET'S GO</button><div className="tutorial-mascot point final-point"><img src="/assets/characters/thumbs/pink.png" alt=""/><span>◀</span></div></div></>}</div></div></div>;
}

function FloatingArcadeArt() { const items: [PlayerColor,string,string][] = [["yellow","float-a","40%"],["blue","float-b","80%"],["pink","float-c","100%"],["green","float-d","60%"]]; return <div className="landing-floats" aria-hidden="true">{items.map(([c,k,row],i)=><div className={`floating-island ${k}`} key={k} style={{"--float-color":PLAYER_HEX[c],"--delay":`${i*-.7}s`,"--tile-row":row} as CSSProperties}><img src={`/assets/characters/thumbs/${c}.png`} alt=""/><span className="decor-hex"/></div>)}</div>; }

function SettingsPanel({ onClose }: { onClose: () => void }) {
  const [music,setMusic]=useState(()=>getSetting("music")), [sfx,setSfx]=useState(()=>getSetting("sfx")), [haptics,setHaptics]=useState(()=>getSetting("haptics"));
  const toggle=(key:"music"|"sfx"|"haptics",current:boolean,setter:(v:boolean)=>void)=>{const next=!current;setter(next);setSetting(key,next);if(key==="sfx"&&next)void playSfx("tileFlip",.18);};
  return <div className="settings-popover ornate-frame"><div className="settings-title">SETTINGS</div><button onClick={()=>toggle("music",music,setMusic)}><span>MUSIC</span><b>{music?"ON":"OFF"}</b></button><button onClick={()=>toggle("sfx",sfx,setSfx)}><span>SOUND FX</span><b>{sfx?"ON":"OFF"}</b></button><button disabled={!canVibrate()} onClick={()=>toggle("haptics",haptics,setHaptics)}><span>HAPTICS</span><b>{canVibrate()?(haptics?"ON":"OFF"):"N/A"}</b></button><button className="settings-close" onClick={onClose}>CLOSE</button></div>;
}

function Landing() {
  const [name,setName]=useState(()=>localStorage.getItem("tiles:name")||""), [code,setCode]=useState(""), [error,setError]=useState(""), [busy,setBusy]=useState<"quick"|"create"|"join"|null>(null), [resumeRoom,setResumeRoom]=useState(()=>localStorage.getItem("tiles:lastRoom")||""), [createOpen,setCreateOpen]=useState(false), [visibility,setVisibility]=useState<RoomVisibility>("public"), [bots,setBots]=useState(true), [settings,setSettings]=useState(false);
  const saveName=()=>{const clean=name.trim().slice(0,16);if(!clean)throw new Error("Enter a player name first.");localStorage.setItem("tiles:name",clean);return clean;};
  async function quickPlay(){try{setBusy("quick");setError("");saveName();const r=await fetch("/api/quick-play",{method:"POST"});const d=await r.json() as {roomCode?:string;error?:string};if(!r.ok||!d.roomCode)throw new Error(d.error||"Could not find a match");localStorage.setItem(`tiles:autoReady:${d.roomCode}`,"yes");location.href=`/room/${d.roomCode}`;}catch(e){setError(e instanceof Error?e.message:"Something went wrong");setBusy(null);}}
  async function createRoom(){try{setBusy("create");setError("");saveName();const r=await fetch("/api/rooms",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({visibility,botsEnabled:visibility==="public"?true:bots})});const d=await r.json() as {roomCode?:string;error?:string};if(!r.ok||!d.roomCode)throw new Error(d.error||"Could not create room");location.href=`/room/${d.roomCode}`;}catch(e){setError(e instanceof Error?e.message:"Something went wrong");setBusy(null);}}
  async function joinRoom(){try{setBusy("join");setError("");saveName();const c=code.toUpperCase().replace(/[^A-Z0-9]/g,"").slice(0,4);if(c.length!==4)throw new Error("Enter the 4-character room code.");const r=await fetch(`/api/rooms/${c}`);if(!r.ok)throw new Error("That room does not exist.");location.href=`/room/${c}`;}catch(e){setError(e instanceof Error?e.message:"Something went wrong");setBusy(null);}}
  async function resume(){if(!resumeRoom)return;try{setBusy("join");const r=await fetch(`/api/rooms/${resumeRoom}`);if(!r.ok)throw new Error("Your previous room has expired.");location.href=`/room/${resumeRoom}`;}catch(e){localStorage.removeItem("tiles:lastRoom");setResumeRoom("");setError(e instanceof Error?e.message:"Previous room unavailable");setBusy(null);}}
  return <main className="landing-screen"><FloatingArcadeArt/><button className="settings-button" type="button" onClick={()=>setSettings(v=>!v)} aria-label="Open settings"><img src="/assets/ui/gear.png" alt=""/></button>{settings&&<SettingsPanel onClose={()=>setSettings(false)}/>}<section className="landing-panel"><Brand/><div className="landing-rule"/><p className="landing-tagline">MOVE FAST · STAY UP · DROP THE FLOOR</p><label className="arcade-label">PLAYER NAME<input value={name} onChange={(e:any)=>setName(e.target.value)} maxLength={16} placeholder="PLAYER 1"/></label><button className="big-action quick-action" onClick={quickPlay} disabled={busy!==null}>{busy==="quick"?"MATCHING...":"QUICK PLAY"}</button><button className="arcade-button create-toggle" onClick={()=>setCreateOpen(v=>!v)} disabled={busy!==null}>CREATE GROUP</button>{createOpen&&<div className="create-options"><div className="option-title">VISIBILITY</div><div className="segmented"><button className={visibility==="public"?"selected":""} onClick={()=>setVisibility("public")}>PUBLIC</button><button className={visibility==="private"?"selected":""} onClick={()=>setVisibility("private")}>PRIVATE</button></div>{visibility==="private"&&<label className="bot-toggle"><span>FILL WITH BOTS</span><button className={bots?"on":""} onClick={()=>setBots(v=>!v)}>{bots?"ON":"OFF"}</button></label>}<button className="arcade-button primary create-confirm" onClick={createRoom} disabled={busy!==null}>{busy==="create"?"CREATING...":"CREATE ROOM"}</button></div>}<div className="or-line"><span>JOIN WITH CODE</span></div><div className="code-row"><input value={code} onChange={(e:any)=>setCode(e.target.value.toUpperCase())} onKeyDown={(e:any)=>{if(e.key==="Enter"&&!busy)void joinRoom();}} maxLength={4} placeholder="K7PX"/><button className="arcade-button secondary-action" onClick={joinRoom} disabled={busy!==null}>{busy==="join"?"JOINING...":"JOIN"}</button></div>{error&&<p className="landing-error">{error}</p>}{resumeRoom&&<button className="resume-button" onClick={resume} disabled={busy!==null}>RECONNECT TO ROOM {resumeRoom}</button>}<div className="how-to-strip"><div><b>1.</b> STEP ON TILES</div><div><b>2.</b> COLLECT POWER-UPS</div><div><b>3.</b> LAST PLAYER WINS</div></div><div className="landing-rule"/><a className="apogee-link" href="https://apogeelab.org" target="_blank" rel="noreferrer"><img src="/assets/apogee-lab-logo.png" alt=""/><span>APOGEE LAB © ↗</span></a></section></main>;
}

function SelectorWheel({ state, myId, serverOffset }: { state: GameState; myId: string|null; serverOffset:number }) {
  const candidates=state.selectorCandidates.map(id=>state.players.find(p=>p.id===id)).filter(Boolean) as PlayerState[], selector=state.players.find(p=>p.id===state.selectorId); if(!candidates.length||!selector)return null;
  const segment=360/candidates.length, gradient=candidates.map((p,i)=>`${PLAYER_HEX[p.color]} ${i*segment}deg ${(i+1)*segment}deg`).join(","), target=Math.max(0,candidates.findIndex(p=>p.id===selector.id)), targetCenter=target*segment+segment/2, pointerCorrection=(90-targetCenter+360)%360, rot=1440+pointerCorrection, overridden=state.overridePendingPlayerId===myId&&state.selectorId===myId;
  useEffect(()=>{const start=(state.phaseEndsAt??0)-SELECTOR_WHEEL_MS,now=Date.now()+serverOffset,total=rot,crossings=Math.max(1,Math.floor(total/segment)),timers:number[]=[];for(let k=1;k<=crossings;k++){const fraction=Math.min(.999,(k*segment)/total),normalized=1-Math.pow(1-fraction,1/4),at=start+normalized*4550-now;if(at>-50)timers.push(window.setTimeout(()=>wheelTick(false),Math.max(0,at)));}const landingAt=start+4550-now;if(landingAt>-50)timers.push(window.setTimeout(()=>wheelTick(true),Math.max(0,landingAt)));return()=>timers.forEach(clearTimeout);},[state.phaseEndsAt,segment,rot,serverOffset]);
  return <div className={`wheel-overlay ${overridden?"override-local":""}`}><div className="wheel-title">SELECTOR</div>{overridden&&<img className="override-banner" src="/assets/ui/override.png" alt="Override"/>}<div className="wheel-pointer">▼</div><div className="selector-wheel" style={{background:`conic-gradient(from -90deg, ${gradient})`,"--wheel-final":`${rot}deg`} as CSSProperties}/></div>;
}

function PlayerCard({p,myId,state,serverOffset}:{p:PlayerState;myId:string|null;state:GameState;serverOffset:number}) {
  const inLobby=state.phase==="lobby";
  const status=!p.connected?"RECONNECTING":inLobby?(p.ready?"READY":"WAITING"):!p.alive&&state.phase!=="podium"?"ELIMINATED":state.phase==="countdown"?"LOCKED IN":"IN GAME";
  const landingIn=state.phaseEndsAt==null?Infinity:state.phaseEndsAt-(Date.now()+serverOffset), selected=state.phase==="selector-wheel"&&state.selectorId===p.id&&landingIn<=470;
  return <div className={`player-card ${!p.alive?"dead":""} ${!p.connected?"offline":""} ${selected?"selector-picked":""}`} style={{"--player-color":PLAYER_HEX[p.color]} as CSSProperties}><img src={`/assets/characters/thumbs/${p.color}.png`} alt=""/><div className="player-card-copy"><b><span className="name-dot"/>{p.name}{state.lastWinnerId===p.id&&<img className="name-crown" src="/assets/ui/crown.png" alt="previous winner"/>}{p.id===myId?" · YOU":""}</b><small>{status}</small></div>{p.wins>0&&<strong className="player-trophies"><img src="/assets/ui/trophy.png" alt="wins"/><PixelDigits text={String(p.wins)} className="pixel-count"/></strong>}</div>;
}

function Podium({state}:{state:GameState}) {
  const ranked=state.podiumIds.map(id=>state.players.find(p=>p.id===id)).filter(Boolean) as PlayerState[], slots=[ranked[1],ranked[0],ranked[2]];
  return <div className="podium-overlay"><div className="podium-scene">{slots.map((p,i)=>p&&<div className={`podium-entry podium-slot-${i} ${p.id===state.lastWinnerId?"podium-winner":""}`} key={p.id}><div className="podium-name">{p.name}{p.id===state.lastWinnerId&&<img className="podium-crown" src="/assets/ui/crown.png" alt="crown"/>}</div><span className={`podium-character color-${p.color}`} style={{backgroundImage:`url(/assets/characters/${p.color}.png)`}}/><div className="podium-block"><PixelDigits text={i===1?"1":i===0?"2":"3"} className="podium-place" label={`${i===1?"first":i===0?"second":"third"} place`}/>{p.wins>0&&<span className="podium-trophies"><img src="/assets/ui/trophy.png" alt="trophies"/><PixelDigits text={String(p.wins)} className="pixel-count" label={`${p.wins} wins`}/></span>}</div></div>)}</div></div>;
}

function Room({roomCode}:{roomCode:string}) {
  const name=localStorage.getItem("tiles:name")||"Player"; localStorage.setItem("tiles:lastRoom",roomCode); const socket=useMemo(()=>new RoomSocket(roomCode,name),[roomCode,name]);
  const [state,setState]=useState<GameState|null>(null), [myId,setMyId]=useState<string|null>(null), [error,setError]=useState(""), [toast,setToast]=useState(""), [fatal,setFatal]=useState(""), [connection,setConnection]=useState<"connecting"|"connected"|"reconnecting"|"closed">("connecting"), [serverOffset,setServerOffset]=useState(0), [goFlashUntil,setGoFlashUntil]=useState(0), [blocked,setBlocked]=useState<{tileId:number;until:number}|null>(null);
  const [,tick]=useState(0); const autoReadySent=useRef(false), lastPhase=useRef<string|null>(null), lastCountdownBeat=useRef<number|null>(null), previousAlive=useRef<boolean|null>(null), lastFinalTwoAnnouncement=useRef<number|null>(null);
  useEffect(()=>{let cancelled=false;const a=socket.onState((next,t)=>{setState(next);setMyId(socket.playerId);setServerOffset(t-Date.now());setError("");}),b=socket.onError(m=>{if(m==="This room is full"||m==="A match is already in progress"){setFatal(m);socket.close();}else setError(m);}),c=socket.onConnection(setConnection),d=socket.onBlockedDestination((tileId)=>{setBlocked({tileId,until:Date.now()+920});void playSfx("blocked",.22,{maxConcurrent:1});}),timer=setInterval(()=>tick(n=>n+1),50);void(async()=>{try{const r=await fetch(`/api/rooms/${roomCode}`);if(!r.ok)throw new Error("This room does not exist or has expired.");if(!cancelled)socket.connect();}catch(e){if(!cancelled)setFatal(e instanceof Error?e.message:"Could not open room");}})();return()=>{cancelled=true;a();b();c();d();clearInterval(timer);socket.close();};},[roomCode,socket]);
  useEffect(()=>{if(!state||!myId||autoReadySent.current)return;if(localStorage.getItem(`tiles:autoReady:${roomCode}`)==="yes"){autoReadySent.current=true;localStorage.removeItem(`tiles:autoReady:${roomCode}`);socket.send({type:"ready",ready:true});}},[state,myId,roomCode,socket]);
  const me=state?.players.find(p=>p.id===myId)||null, remaining=state?.phaseEndsAt?Math.max(0,state.phaseEndsAt-(Date.now()+serverOffset)):0;
  const finalTwo=Boolean(state&&state.players.filter(p=>p.alive).length===2&&!['lobby','podium'].includes(state.phase));
  useEffect(()=>{document.documentElement.dataset.finalTwo=finalTwo?"yes":"no";window.dispatchEvent(new CustomEvent(FINAL_TWO_EVENT,{detail:{active:finalTwo}}));return()=>{document.documentElement.dataset.finalTwo="no";};},[finalTwo]);
  useEffect(()=>{if(!state)return;const phase=state.phase;if(lastPhase.current!==phase){const prev=lastPhase.current;lastPhase.current=phase;lastCountdownBeat.current=null;if(phase==="shuffle"){const qs=state.tiles.map(t=>t.q),minQ=Math.min(...qs),maxQ=Math.max(...qs),span=Math.max(0,ROUND_SHUFFLE_MS-280);state.tiles.forEach(tile=>{const pos=(tile.q-minQ)/Math.max(1,maxQ-minQ),jitter=((tile.id*7)%11)-5,at=Math.max(0,Math.round(pos*span+jitter));window.setTimeout(()=>void playSfx("tileFlip",.12,{maxConcurrent:7}),at);});}if(phase==="movement"&&prev==="pre-round"){countdownBeep(true);setGoFlashUntil(Date.now()+420);}if(phase==="reveal")window.setTimeout(()=>void playSfx("tileBreak",.34,{maxConcurrent:1}),Math.round(REVEAL_WINDOW_MS*.37));if(phase==="podium")window.setTimeout(()=>void playSfx("podium",.42,{maxConcurrent:1}),600);}},[state?.phase,state?.round]);
  useEffect(()=>{if(!state?.finalTwoAnnouncedAt||lastFinalTwoAnnouncement.current===state.finalTwoAnnouncedAt)return;lastFinalTwoAnnouncement.current=state.finalTwoAnnouncedAt;const now=Date.now()+serverOffset;if(now-state.finalTwoAnnouncedAt<PRE_ROUND_COUNTDOWN_MS+500)void playSfx("finalTwo",.34,{maxConcurrent:1});},[state?.finalTwoAnnouncedAt,serverOffset]);
  useEffect(()=>{if(!state||state.phase!=="pre-round")return;const beat=Math.ceil(remaining/1000);if(beat>=1&&beat<=3&&lastCountdownBeat.current!==beat){lastCountdownBeat.current=beat;countdownBeep(false);}},[state?.phase,remaining]);
  useEffect(()=>{if(!me)return;if(previousAlive.current===true&&!me.alive)haptic([90,35,140]);previousAlive.current=me.alive;},[me?.alive]);
  useEffect(()=>{const handler=(e:KeyboardEvent)=>{if(e.code!=="Space"||e.repeat)return;const target=e.target as HTMLElement|null;if(target&&['INPUT','TEXTAREA','SELECT'].includes(target.tagName))return;e.preventDefault();socket.send({type:"use-powerup"});};window.addEventListener("keydown",handler);return()=>window.removeEventListener("keydown",handler);},[socket]);
  const move=useCallback((tileId:number)=>socket.send({type:"move",tileId}),[socket]);
  if(fatal)return <main className="loading-screen"><Brand/><p>{fatal}</p><a href="/" className="arcade-button">BACK</a></main>;
  if(!state)return <main className="loading-screen"><Brand/><p>{error||`CONNECTING TO ${roomCode}...`}</p></main>;
  const selector=state.players.find(p=>p.id===state.selectorId), choose=(color:TileColor)=>socket.send({type:"choose-color",color}), usePower=()=>socket.send({type:"use-powerup"}), ready=()=>socket.send({type:"ready",ready:!me?.ready});
  async function copyCode(){try{await navigator.clipboard.writeText(roomCode);setToast("COPIED TO CLIPBOARD");window.setTimeout(()=>setToast(""),1000);}catch{setToast(roomCode);window.setTimeout(()=>setToast(""),1000);}}
  function leaveRoom(){localStorage.removeItem("tiles:lastRoom");localStorage.removeItem(roomIdentityKey(roomCode));socket.send({type:"leave-room"});window.setTimeout(()=>{socket.close();location.href="/";},80);}
  const pType=me?.powerup, powerName=pType==="phase"?"PHASE SHIFT":pType==="override"?"OVERRIDE":"INVISIBILITY", powerHint=pType==="phase"?"USE DURING DROP":pType==="override"?"NEXT SELECTOR IS YOU":"HIDE THIS ROUND", matchCountdown=Math.max(0,remaining), goFlash=Date.now()<goFlashUntil;
  const showFinalTwoAnnouncement=state.phase==="pre-round"&&state.finalTwoAnnouncedAt!=null&&(Date.now()+serverOffset-state.finalTwoAnnouncedAt)<1560;
  return <main className={`game-screen ${finalTwo?"final-two":""}`}><header className="arcade-header ornate-frame"><button className="header-room room-copy" onClick={copyCode} aria-label={`Copy room code ${roomCode}`}><small>ROOM</small><strong>{roomCode}</strong></button><Brand/><div className="header-round header-badge"><small>ROUND</small><strong>{Math.max(1,state.round)}</strong></div></header>{connection==="reconnecting"&&<div className="connection-strip">RECONNECTING TO YOUR PLAYER...</div>}<section className="game-grid"><aside className="arcade-panel power-panel ornate-frame"><div className="panel-heading">POWER UP <span>1 SLOT</span></div>{pType?<button className={`power-card ${pType}`} onClick={usePower}><PowerIcon type={pType}/><b>{powerName}</b><small>{powerHint} · SPACE</small></button>:<div className="empty-slot"><div>+</div><span>EMPTY</span></div>}<p>RUN OVER AN ITEM TO COLLECT IT. YOU CAN ONLY HOLD ONE.</p></aside><div className={`arena-frame ornate-frame ${finalTwo?"final-two-arena":""}`}><GameCanvas state={state} myPlayerId={myId} serverOffset={serverOffset} onTileClick={move} blockedTileId={blocked&&Date.now()<blocked.until?blocked.tileId:null} blockedUntil={blocked?.until??0}/>{state.phase==="countdown"&&<div className="round-overlay"><PixelTimer ms={matchCountdown}/><span>GAME STARTING</span></div>}{state.phase==="pre-round"&&<div className="pre-round-overlay">{showFinalTwoAnnouncement&&<div className="final-two-announcement-frame"><img className="final-two-banner" src="/assets/ui/final-two.png" alt="Final Two"/></div>}{!showFinalTwoAnnouncement&&<img className="ready-banner" src="/assets/ui/ready.png" alt="Ready"/>}</div>}{state.phase==="movement"&&<><div className="phase-timer-frame"><PixelTimer ms={remaining}/></div>{goFlash&&<div className="go-flash-overlay"><img className="go-banner" src="/assets/ui/go.png" alt="Go"/></div>}</>}{state.phase==="selector-wheel"&&<SelectorWheel state={state} myId={myId} serverOffset={serverOffset}/>} {state.phase==="selector-choice"&&me?.id===state.selectorId&&<div className="color-popup"><div className="choice-timer-frame"><PixelTimer ms={remaining}/></div><div className="popup-kicker">YOU CONTROL THE FLOOR</div><h2>CHOOSE A COLOR TO DROP</h2><div className="color-grid">{TILE_COLORS.map(c=><button key={c} onClick={()=>choose(c)} style={{"--tile-color":TILE_HEX[c]} as CSSProperties}><span/><b>{c.toUpperCase()}</b></button>)}</div></div>}{state.phase==="selector-choice"&&me?.id!==state.selectorId&&<div className="waiting-overlay"><PixelTimer ms={remaining}/><strong style={{color:selector?PLAYER_HEX[selector.color]:undefined}}>{selector?.name.toUpperCase()||"PLAYER"}</strong><span>IS CHOOSING...</span></div>}{state.phase==="reveal"&&<div className="drop-callout" style={{borderColor:state.selectedColor?TILE_HEX[state.selectedColor]:undefined}}>{state.selectedColor?.toUpperCase()} DROPS!</div>}{state.phase==="results"&&<div className="result-callout">{state.message.toUpperCase()}</div>}{state.phase==="podium"&&<Podium state={state}/>} {!me?.alive&&!['lobby','podium'].includes(state.phase)&&<div className="spectator-badge">SPECTATING</div>}</div><aside className="arcade-panel players-panel ornate-frame"><div className="panel-heading">PLAYERS <span>{state.players.length}/5</span></div><div className="player-list">{state.players.map(p=><PlayerCard key={p.id} p={p} myId={myId} state={state} serverOffset={serverOffset}/>)}</div>{state.phase==="lobby"&&<div className="desktop-lobby-actions"><button className={`arcade-button ${me?.ready?"ready":""}`} onClick={ready}>{me?.ready?"READY ✓":"READY"}</button><div className="lobby-status">{state.room.startCommitted?"START LOCKED":me?.ready?"WAITING FOR PLAYERS":"READY WHEN YOU ARE"}</div></div>}<button className="leave-button desktop-leave" onClick={leaveRoom}>LEAVE ROOM</button></aside></section>{state.phase==="lobby"&&<div className="mobile-actionbar"><button className={`arcade-button ${me?.ready?"ready":""}`} onClick={ready}>{me?.ready?"READY ✓":"READY"}</button><button className="leave-button" onClick={leaveRoom}>LEAVE ROOM</button></div>}{state.phase!=="lobby"&&state.phase!=="podium"&&<button className="mobile-leave-float" onClick={leaveRoom}>LEAVE</button>}{(error||toast)&&<div className="toast">{toast||error}</div>}</main>;
}

export default function App(){const [introDone,setIntroDone]=useState(()=>localStorage.getItem("tiles:intro:v8")==="done");const room=currentRoomCode();const done=()=>{localStorage.setItem("tiles:intro:v8","done");setIntroDone(true);};return <><ViewportController/><MusicController/><ParticleField/>{!introDone&&<Intro onDone={done}/>} {room?<Room roomCode={room}/>:<Landing/>}</>;}
