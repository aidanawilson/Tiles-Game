const MUSIC_PATHS = {
  normal: "/audio/retro-arcade-theme.mp3",
  "final-two": "/audio/retro-arcade-theme-final-two.mp3",
} as const;

const SFX_PATHS = {
  tileFlip: "/audio/sfx/tile-flip-click.mp3",
  tileBreak: "/audio/sfx/tile-break.mp3",
  finalTwo: "/audio/sfx/final-two-swoosh.mp3",
  podium: "/audio/sfx/podium-fanfare.mp3",
  blocked: "/audio/sfx/blocked-destination.mp3",
} as const;

export type MusicMode = keyof typeof MUSIC_PATHS;
export type SfxName = keyof typeof SFX_PATHS;
export type VolumeKind = "music" | "sfx";

const MUSIC_BASE_GAIN = 0.221; // v0.8 used 0.34; v0.9 hard-mix lowers music by 35%.
const MUSIC_CROSSFADE_SECONDS = 0.3;
const WATCHDOG_MS = 1000;

function clamp01(v: number) { return Math.max(0, Math.min(1, v)); }
function volumeKey(kind: VolumeKind) { return `tiles:settings:${kind}Volume`; }
function legacyEnabledKey(kind: VolumeKind) { return `tiles:settings:${kind}`; }

export function getVolumeSetting(kind: VolumeKind): number {
  try {
    const explicit = Number(localStorage.getItem(volumeKey(kind)));
    if (Number.isFinite(explicit) && explicit >= 0 && explicit <= 100) return Math.round(explicit);
    return localStorage.getItem(legacyEnabledKey(kind)) === "off" ? 0 : 100;
  } catch { return 100; }
}

export function setVolumeSetting(kind: VolumeKind, value: number) {
  const rounded = Math.max(0, Math.min(100, Math.round(value / 5) * 5));
  localStorage.setItem(volumeKey(kind), String(rounded));
  // Keep the old on/off preference in sync so existing installs migrate cleanly.
  localStorage.setItem(legacyEnabledKey(kind), rounded > 0 ? "on" : "off");
  tilesAudio.refreshSettings();
  return rounded;
}

type MusicPlayback = {
  mode: MusicMode;
  source: AudioBufferSourceNode;
  gain: GainNode;
  startedAt: number;
  startOffset: number;
  duration: number;
};

class TilesAudioManager {
  private context: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private sfxGain: GainNode | null = null;
  private musicBuffers = new Map<MusicMode, AudioBuffer>();
  private sfxBuffers = new Map<SfxName, AudioBuffer>();
  private loadingMusic = new Map<MusicMode, Promise<AudioBuffer | null>>();
  private loadingSfx = new Map<SfxName, Promise<AudioBuffer | null>>();
  private activeSfx = new Map<SfxName, number>();
  private activeSfxSources = new Set<AudioBufferSourceNode>();
  private currentMusic: MusicPlayback | null = null;
  private desiredMode: MusicMode = "normal";
  private storedProgress = 0;
  private userUnlocked = false;
  private mounted = false;
  private watchdog: number | null = null;
  private transitionSerial = 0;
  private lastContextRebuildAt = 0;
  private removeListeners: Array<() => void> = [];

  mount() {
    if (this.mounted) return () => undefined;
    this.mounted = true;

    // Explicitly choose non-persistent, game-like audio semantics on browsers that expose it.
    try {
      const nav = navigator as Navigator & { audioSession?: { type?: string } };
      if (nav.audioSession) nav.audioSession.type = "ambient";
    } catch { /* optional platform hint */ }

    const unlock = () => { void this.unlockFromGesture(); };
    const visibility = () => {
      if (document.visibilityState === "hidden") this.backgroundImmediately();
      else void this.foregroundResume();
    };
    const pageHide = () => this.backgroundImmediately();
    const pageShow = () => { if (document.visibilityState === "visible") void this.foregroundResume(); };

    window.addEventListener("pointerdown", unlock, { capture: true });
    window.addEventListener("keydown", unlock, { capture: true });
    window.addEventListener("touchstart", unlock, { capture: true, passive: true });
    document.addEventListener("visibilitychange", visibility);
    window.addEventListener("pagehide", pageHide);
    window.addEventListener("pageshow", pageShow);
    this.removeListeners.push(
      () => window.removeEventListener("pointerdown", unlock, { capture: true } as EventListenerOptions),
      () => window.removeEventListener("keydown", unlock, { capture: true } as EventListenerOptions),
      () => window.removeEventListener("touchstart", unlock, { capture: true } as EventListenerOptions),
      () => document.removeEventListener("visibilitychange", visibility),
      () => window.removeEventListener("pagehide", pageHide),
      () => window.removeEventListener("pageshow", pageShow),
    );

    this.watchdog = window.setInterval(() => void this.watchdogTick(), WATCHDOG_MS);
    return () => this.unmount();
  }

  private unmount() {
    if (!this.mounted) return;
    this.mounted = false;
    this.removeListeners.splice(0).forEach(fn => fn());
    if (this.watchdog !== null) window.clearInterval(this.watchdog);
    this.watchdog = null;
    this.backgroundImmediately();
  }

  private isForeground() { return document.visibilityState === "visible"; }
  private musicVolume() { return getVolumeSetting("music") / 100; }
  private sfxVolume() { return getVolumeSetting("sfx") / 100; }

  private ensureContext() {
    if (!this.context || this.context.state === "closed") {
      const Ctx = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctx) throw new Error("Web Audio unavailable");
      this.context = new Ctx({ latencyHint: "interactive" });
      this.masterGain = this.context.createGain();
      this.musicGain = this.context.createGain();
      this.sfxGain = this.context.createGain();
      this.masterGain.gain.value = 1;
      this.musicGain.gain.value = MUSIC_BASE_GAIN * this.musicVolume();
      this.sfxGain.gain.value = this.sfxVolume();
      this.musicGain.connect(this.masterGain);
      this.sfxGain.connect(this.masterGain);
      this.masterGain.connect(this.context.destination);
      // Decoded AudioBuffers belong to a context in practice; reset caches if context is rebuilt.
      this.musicBuffers.clear();
      this.sfxBuffers.clear();
      this.loadingMusic.clear();
      this.loadingSfx.clear();
    }
    return this.context;
  }

  private rebuildContext() {
    const old = this.context;
    this.stopMusic(true);
    this.stopSfxImmediately();
    this.context = null;
    this.masterGain = null;
    this.musicGain = null;
    this.sfxGain = null;
    this.musicBuffers.clear();
    this.sfxBuffers.clear();
    this.loadingMusic.clear();
    this.loadingSfx.clear();
    if (old && old.state !== "closed") void old.close().catch(() => undefined);
    return this.ensureContext();
  }

  private async ensureRunning() {
    if (!this.isForeground()) return false;
    let c: AudioContext;
    try { c = this.ensureContext(); } catch { return false; }
    if (c.state === "running") return true;
    try { await c.resume(); } catch { /* retry below with a fresh context */ }
    if (this.context?.state === "running") return true;

    // iOS/WebKit can occasionally leave a resumed context in a dead/interrupted state
    // after lock/background transitions. Rebuild at a bounded cadence rather than
    // endlessly calling resume() on the same object.
    const now = Date.now();
    if (now - this.lastContextRebuildAt < 2500) return false;
    this.lastContextRebuildAt = now;
    try { c = this.rebuildContext(); } catch { return false; }
    try { await c.resume(); } catch { return false; }
    return String(c.state) === "running";
  }

  private async unlockFromGesture() {
    this.userUnlocked = true;
    if (!(await this.ensureRunning())) return;
    void this.preload();
    await this.ensureMusic();
  }

  async preload() {
    if (!this.userUnlocked && !this.context) return;
    await Promise.all([
      ...((Object.keys(MUSIC_PATHS) as MusicMode[]).map(mode => this.loadMusic(mode))),
      ...((Object.keys(SFX_PATHS) as SfxName[]).map(name => this.loadSfx(name))),
    ]);
  }

  private async decodePath(path: string) {
    const c = this.ensureContext();
    const response = await fetch(path, { cache: "force-cache" });
    if (!response.ok) throw new Error(`Audio ${response.status}`);
    const data = await response.arrayBuffer();
    return c.decodeAudioData(data.slice(0));
  }

  private async loadMusic(mode: MusicMode) {
    const cached = this.musicBuffers.get(mode); if (cached) return cached;
    const existing = this.loadingMusic.get(mode); if (existing) return existing;
    const promise = this.decodePath(MUSIC_PATHS[mode]).then(buffer => { this.musicBuffers.set(mode, buffer); return buffer; }).catch(() => null);
    this.loadingMusic.set(mode, promise);
    const result = await promise; this.loadingMusic.delete(mode); return result;
  }

  private async loadSfx(name: SfxName) {
    const cached = this.sfxBuffers.get(name); if (cached) return cached;
    const existing = this.loadingSfx.get(name); if (existing) return existing;
    const promise = this.decodePath(SFX_PATHS[name]).then(buffer => { this.sfxBuffers.set(name, buffer); return buffer; }).catch(() => null);
    this.loadingSfx.set(name, promise);
    const result = await promise; this.loadingSfx.delete(name); return result;
  }

  private currentProgress() {
    const p = this.currentMusic;
    const c = this.context;
    if (!p || !c || p.duration <= 0) return this.storedProgress;
    const elapsed = Math.max(0, c.currentTime - p.startedAt);
    return ((p.startOffset + elapsed) % p.duration) / p.duration;
  }

  private createMusicPlayback(mode: MusicMode, buffer: AudioBuffer, progress: number, gainValue: number): MusicPlayback {
    const c = this.ensureContext();
    const source = c.createBufferSource();
    const gain = c.createGain();
    const offset = ((progress % 1) + 1) % 1 * buffer.duration;
    source.buffer = buffer;
    source.loop = true;
    gain.gain.value = gainValue;
    source.connect(gain);
    gain.connect(this.musicGain!);
    source.start(0, offset);
    return { mode, source, gain, startedAt: c.currentTime, startOffset: offset, duration: buffer.duration };
  }

  setMusicMode(mode: MusicMode) {
    this.desiredMode = mode;
    if (this.currentMusic?.mode === mode) return;
    if (this.isForeground() && this.userUnlocked && this.musicVolume() > 0) void this.transitionTo(mode);
  }

  private async ensureMusic() {
    if (!this.userUnlocked || !this.isForeground() || this.musicVolume() <= 0) return;
    if (this.currentMusic?.mode === this.desiredMode && this.context?.state === "running") return;
    if (this.currentMusic) return this.transitionTo(this.desiredMode);
    if (!(await this.ensureRunning())) return;
    const buffer = await this.loadMusic(this.desiredMode);
    if (!buffer || !this.isForeground() || this.musicVolume() <= 0 || this.currentMusic) return;
    try { this.currentMusic = this.createMusicPlayback(this.desiredMode, buffer, this.storedProgress, 1); } catch { /* watchdog retries */ }
  }

  private async transitionTo(mode: MusicMode) {
    this.desiredMode = mode;
    const serial = ++this.transitionSerial;
    if (!this.userUnlocked || !this.isForeground() || this.musicVolume() <= 0) return;
    if (!(await this.ensureRunning())) return;
    const old = this.currentMusic;
    if (old?.mode === mode) return;
    const buffer = await this.loadMusic(mode);
    if (!buffer || serial !== this.transitionSerial || !this.isForeground() || this.desiredMode !== mode) return;
    const progress = this.currentProgress();
    let next: MusicPlayback;
    try { next = this.createMusicPlayback(mode, buffer, progress, old ? 0 : 1); }
    catch { return; }
    this.currentMusic = next;
    this.storedProgress = progress;
    if (!old || !this.context) return;

    const now = this.context.currentTime;
    try {
      old.gain.gain.cancelScheduledValues(now);
      next.gain.gain.cancelScheduledValues(now);
      old.gain.gain.setValueAtTime(Math.max(0.0001, old.gain.gain.value), now);
      next.gain.gain.setValueAtTime(0.0001, now);
      old.gain.gain.linearRampToValueAtTime(0.0001, now + MUSIC_CROSSFADE_SECONDS);
      next.gain.gain.linearRampToValueAtTime(1, now + MUSIC_CROSSFADE_SECONDS);
      window.setTimeout(() => { try { old.source.stop(); } catch { } }, Math.ceil((MUSIC_CROSSFADE_SECONDS + .06) * 1000));
    } catch {
      // New source is already active. If automation fails, preserve continuity rather than silence.
      try { next.gain.gain.value = 1; } catch { }
      try { old.source.stop(); } catch { }
    }
  }

  private stopMusic(saveProgress = true) {
    this.transitionSerial++;
    if (saveProgress) this.storedProgress = this.currentProgress();
    if (this.currentMusic) {
      try { this.currentMusic.source.stop(); } catch { }
      try { this.currentMusic.source.disconnect(); } catch { }
      try { this.currentMusic.gain.disconnect(); } catch { }
    }
    this.currentMusic = null;
  }

  private stopSfxImmediately() {
    for (const source of this.activeSfxSources) { try { source.stop(); } catch { } }
    this.activeSfxSources.clear();
    this.activeSfx.clear();
  }

  private backgroundImmediately() {
    this.stopMusic(true);
    this.stopSfxImmediately();
    const c = this.context;
    if (c && c.state === "running") void c.suspend().catch(() => undefined);
  }

  private async foregroundResume() {
    if (!this.userUnlocked || this.musicVolume() <= 0 || !this.isForeground()) return;
    if (!(await this.ensureRunning())) return;
    await this.ensureMusic();
  }

  private async watchdogTick() {
    if (!this.userUnlocked || !this.isForeground() || this.musicVolume() <= 0) return;
    const running = await this.ensureRunning();
    if (!running) return;
    if (!this.currentMusic) await this.ensureMusic();
  }

  refreshSettings() {
    const music = this.musicVolume(), sfx = this.sfxVolume();
    if (this.musicGain) this.musicGain.gain.value = MUSIC_BASE_GAIN * music;
    if (this.sfxGain) this.sfxGain.gain.value = sfx;
    if (music <= 0) this.stopMusic(true);
    else if (this.userUnlocked && this.isForeground()) void this.ensureMusic();
    if (sfx <= 0) this.stopSfxImmediately();
  }

  async playSfx(name: SfxName, volume = .3, options?: { maxConcurrent?: number; delayMs?: number; rate?: number }) {
    if (!this.userUnlocked || !this.isForeground() || this.sfxVolume() <= 0) return;
    const max = options?.maxConcurrent ?? 8;
    if ((this.activeSfx.get(name) ?? 0) >= max) return;
    if (!(await this.ensureRunning())) return;
    const buffer = await this.loadSfx(name);
    if (!buffer || !this.isForeground() || this.sfxVolume() <= 0) return;
    const c = this.ensureContext(), src = c.createBufferSource(), gain = c.createGain();
    src.buffer = buffer;
    src.playbackRate.value = options?.rate ?? 1;
    gain.gain.value = clamp01(volume);
    src.connect(gain); gain.connect(this.sfxGain!);
    this.activeSfx.set(name, (this.activeSfx.get(name) ?? 0) + 1);
    this.activeSfxSources.add(src);
    src.onended = () => {
      this.activeSfx.set(name, Math.max(0, (this.activeSfx.get(name) ?? 1) - 1));
      this.activeSfxSources.delete(src);
      try { src.disconnect(); gain.disconnect(); } catch { }
    };
    src.start(c.currentTime + Math.max(0, options?.delayMs ?? 0) / 1000);
  }

  playTone(frequency: number, duration = .07, volume = .035, kind: OscillatorType = "square", endFrequency?: number) {
    if (!this.userUnlocked || !this.isForeground() || this.sfxVolume() <= 0) return;
    void (async () => {
      if (!(await this.ensureRunning()) || !this.isForeground()) return;
      const c = this.ensureContext(), o = c.createOscillator(), g = c.createGain(), t = c.currentTime;
      o.type = kind;
      o.frequency.setValueAtTime(frequency, t);
      if (endFrequency) o.frequency.exponentialRampToValueAtTime(Math.max(20, endFrequency), t + duration);
      g.gain.setValueAtTime(.0001, t);
      g.gain.exponentialRampToValueAtTime(Math.max(.0002, volume), t + .008);
      g.gain.exponentialRampToValueAtTime(.0001, t + duration);
      o.connect(g); g.connect(this.sfxGain!); o.start(t); o.stop(t + duration + .02);
    })();
  }
}

export const tilesAudio = new TilesAudioManager();
export function preloadAudio() { void tilesAudio.preload(); }
export function preloadSfx() { preloadAudio(); }
export function playSfx(name: SfxName, volume = .3, options?: { maxConcurrent?: number; delayMs?: number; rate?: number }) { return tilesAudio.playSfx(name, volume, options); }
export function playTone(frequency: number, duration = .07, volume = .035, kind: OscillatorType = "square", endFrequency?: number) { tilesAudio.playTone(frequency, duration, volume, kind, endFrequency); }
