const SFX_PATHS = {
  tileFlip: "/audio/sfx/tile-flip-click.mp3",
  tileBreak: "/audio/sfx/tile-break.mp3",
  finalTwo: "/audio/sfx/final-two-swoosh.mp3",
  podium: "/audio/sfx/podium-fanfare.mp3",
  blocked: "/audio/sfx/blocked-destination.mp3",
} as const;

type SfxName = keyof typeof SFX_PATHS;
let context: AudioContext | null = null;
const buffers = new Map<SfxName, AudioBuffer>();
const loading = new Map<SfxName, Promise<AudioBuffer | null>>();
const active = new Map<SfxName, number>();

function enabled() { return localStorage.getItem("tiles:settings:sfx") !== "off"; }
function audioCtx() {
  if (!context) context = new AudioContext();
  if (context.state === "suspended") void context.resume();
  return context;
}
async function load(name: SfxName) {
  const cached = buffers.get(name); if (cached) return cached;
  const inFlight = loading.get(name); if (inFlight) return inFlight;
  const promise = (async () => {
    try {
      const c = audioCtx();
      const response = await fetch(SFX_PATHS[name]);
      const data = await response.arrayBuffer();
      const buffer = await c.decodeAudioData(data.slice(0));
      buffers.set(name, buffer); return buffer;
    } catch { return null; }
  })();
  loading.set(name, promise);
  const result = await promise; loading.delete(name); return result;
}
export function preloadSfx() { (Object.keys(SFX_PATHS) as SfxName[]).forEach(name => void load(name)); }
export async function playSfx(name: SfxName, volume = .3, options?: { maxConcurrent?: number; delayMs?: number; rate?: number }) {
  if (!enabled()) return;
  const max = options?.maxConcurrent ?? 8;
  if ((active.get(name) ?? 0) >= max) return;
  const buffer = await load(name); if (!buffer || !enabled()) return;
  const c = audioCtx(), src = c.createBufferSource(), gain = c.createGain();
  src.buffer = buffer; src.playbackRate.value = options?.rate ?? 1; gain.gain.value = volume;
  src.connect(gain); gain.connect(c.destination);
  active.set(name, (active.get(name) ?? 0) + 1);
  src.onended = () => active.set(name, Math.max(0, (active.get(name) ?? 1) - 1));
  src.start(c.currentTime + Math.max(0, options?.delayMs ?? 0) / 1000);
}
