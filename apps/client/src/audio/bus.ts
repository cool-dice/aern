/**
 * Client audio bus. Playback is a port: this module never touches the Web Audio API.
 * Clip ids are strings. There are no sound files in the repo.
 */

export const AUDIO_MANIFEST = {
  format: 'ogg',
  sampleRateHz: 44_100,
} as const;

export const AUDIO_CHANNELS = ['music', 'effects', 'ambient', 'voice', 'ui'] as const;

export type AudioChannel = (typeof AUDIO_CHANNELS)[number];

/** How long the victory layer stays up after combat ends. */
export const VICTORY_HOLD_MS = 30_000;

/** Tension joins when hp / max is strictly below this, or a boss is active. */
export const TENSION_HP_RATIO = 0.3;

export const AMBIENT_DAY_ID = 'ambient_day';
export const AMBIENT_NIGHT_ID = 'ambient_night';

export type DayPhase = 'day' | 'night';

export type ActorKind = 'player' | 'bot';

export interface MusicSituation {
  inCombat: boolean;
  city: boolean;
  dungeon: boolean;
  hpRatio: number;
  boss: boolean;
  victoryMsLeft: number;
}

export interface AudioSink {
  play(clipId: string, gain: number): void;
  stop(clipId: string): void;
}

export interface SubtitleEvent {
  type: 'subtitle';
  text: string;
}

export interface AudioFrame {
  nowMs: number;
  inCombat: boolean;
  city: boolean;
  dungeon: boolean;
  hpRatio: number;
  boss: boolean;
}

export interface ClipPlay {
  clipId: string;
  channel: AudioChannel;
  /** Per-clip gain before the channel volume. Defaults to 1. */
  gain?: number;
  /** Localization key. Emitted only when subtitles are enabled. */
  subtitleKey?: string;
  actor?: ActorKind;
}

export interface MemorySinkCall {
  op: 'play' | 'stop';
  clipId: string;
  gain: number | null;
}

export interface MemorySink extends AudioSink {
  playing(): Readonly<Record<string, number>>;
  calls(): readonly MemorySinkCall[];
}

export interface AudioBus {
  setVolume(channel: AudioChannel, value: number): void;
  volume(channel: AudioChannel): number;
  setSubtitles(enabled: boolean): void;
  subtitlesEnabled(): boolean;
  setPhase(phase: DayPhase): void;
  phase(): DayPhase;
  ambientId(): string;
  update(frame: AudioFrame): void;
  layers(): string[];
  victoryMsLeft(): number;
  play(request: ClipPlay): void;
  stop(clipId: string): void;
  takeEvents(): SubtitleEvent[];
}

/** Damage and UI cues. Clip files are absent, so the id is a generated tone. */
export function playTone(bus: AudioBus, event: string): void {
  bus.play({ clipId: `tone:${event}`, channel: 'effects', gain: 0.4 });
}

function finiteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function clamp01(value: number): number {
  if (!finiteNumber(value) || value <= 0) return 0;
  if (value >= 1) return 1;
  return value;
}

function isAudioChannel(value: string): value is AudioChannel {
  return (AUDIO_CHANNELS as readonly string[]).includes(value);
}

/** Active music layers. `base` is always on. Victory suppresses rhythm. */
export function layersFor(situation: MusicSituation): string[] {
  const victory = finiteNumber(situation.victoryMsLeft) && situation.victoryMsLeft > 0;
  // Victory outranks combat. While both are true, only the bed and the stinger remain.
  if (victory && situation.inCombat) {
    return ['base', 'victory'];
  }

  const layers: string[] = ['base'];
  if (situation.inCombat) layers.push('rhythm');
  if (situation.city) layers.push('melody');
  if (situation.dungeon) layers.push('atmosphere');
  const lowHp = finiteNumber(situation.hpRatio) && situation.hpRatio < TENSION_HP_RATIO;
  if (lowHp || situation.boss) layers.push('tension');
  if (victory) layers.push('victory');
  return layers;
}

/**
 * Multiplies every channel factor by `clipGain`, then clips the product to 0..1.
 * A non-numeric or non-finite factor yields 0.
 */
export function mix(volumes: Record<string, number>, clipGain: number): number {
  if (!finiteNumber(clipGain)) return 0;
  let product = clipGain;
  for (const value of Object.values(volumes)) {
    if (!finiteNumber(value)) return 0;
    product *= value;
  }
  if (!Number.isFinite(product)) return 0;
  if (product < 0) return 0;
  if (product > 1) return 1;
  return product;
}

/** Day and night swap the ambient clip id and do not change music layers. */
export function ambientClipId(phase: DayPhase): string {
  return phase === 'night' ? AMBIENT_NIGHT_ID : AMBIENT_DAY_ID;
}

/** Bots use the player's clip ids. There is no separate bot bank. */
export function resolveClipId(clipId: string, actor: ActorKind): string {
  switch (actor) {
    case 'player':
    case 'bot':
      return clipId;
    default: {
      const unexpected: never = actor;
      void unexpected;
      return clipId;
    }
  }
}

export function createMemorySink(): MemorySink {
  const active = new Map<string, number>();
  const calls: MemorySinkCall[] = [];
  return {
    play(clipId, gain) {
      active.set(clipId, gain);
      calls.push({ op: 'play', clipId, gain });
    },
    stop(clipId) {
      active.delete(clipId);
      calls.push({ op: 'stop', clipId, gain: null });
    },
    playing() {
      return Object.fromEntries(active);
    },
    calls() {
      return calls.slice();
    },
  };
}

export function createAudioBus(sink: AudioSink): AudioBus {
  const volumes: Record<AudioChannel, number> = {
    music: 1,
    effects: 1,
    ambient: 1,
    voice: 1,
    ui: 1,
  };
  let subtitles = false;
  let phase: DayPhase = 'day';
  let wasInCombat = false;
  let victoryUntilMs: number | null = null;
  let victoryLeft = 0;
  let currentLayers: string[] = [];
  let appliedMusicGain = Number.NaN;
  let activeAmbient: string | null = null;
  let appliedAmbientGain = Number.NaN;
  const events: SubtitleEvent[] = [];

  function syncMusic(next: readonly string[]): void {
    const upcoming = [...next];
    const gain = mix({ music: volumes.music }, 1);
    const gainChanged = appliedMusicGain !== gain;
    for (const layer of currentLayers) {
      if (!upcoming.includes(layer)) sink.stop(layer);
    }
    for (const layer of upcoming) {
      if (gainChanged || !currentLayers.includes(layer)) sink.play(layer, gain);
    }
    currentLayers = upcoming;
    appliedMusicGain = gain;
  }

  function syncAmbient(): void {
    const id = ambientClipId(phase);
    const gain = mix({ ambient: volumes.ambient }, 1);
    if (activeAmbient === id && appliedAmbientGain === gain) return;
    if (activeAmbient !== null && activeAmbient !== id) sink.stop(activeAmbient);
    sink.play(id, gain);
    activeAmbient = id;
    appliedAmbientGain = gain;
  }

  return {
    setVolume(channel, value) {
      if (!isAudioChannel(channel)) return;
      volumes[channel] = clamp01(value);
      if (channel === 'music' && currentLayers.length > 0) syncMusic(currentLayers);
      if (channel === 'ambient' && activeAmbient !== null) syncAmbient();
    },
    volume(channel) {
      return volumes[channel];
    },
    setSubtitles(enabled) {
      subtitles = enabled;
    },
    subtitlesEnabled() {
      return subtitles;
    },
    setPhase(next) {
      phase = next === 'night' ? 'night' : 'day';
      syncAmbient();
    },
    phase() {
      return phase;
    },
    ambientId() {
      return ambientClipId(phase);
    },
    update(frame) {
      if (finiteNumber(frame.nowMs)) {
        if (wasInCombat && !frame.inCombat) {
          victoryUntilMs = frame.nowMs + VICTORY_HOLD_MS;
        }
        wasInCombat = frame.inCombat;
        if (victoryUntilMs !== null && frame.nowMs >= victoryUntilMs) {
          victoryUntilMs = null;
        }
        victoryLeft = victoryUntilMs === null ? 0 : Math.max(0, victoryUntilMs - frame.nowMs);
      } else {
        victoryLeft = 0;
      }
      syncMusic(
        layersFor({
          inCombat: frame.inCombat,
          city: frame.city,
          dungeon: frame.dungeon,
          hpRatio: frame.hpRatio,
          boss: frame.boss,
          victoryMsLeft: victoryLeft,
        }),
      );
      syncAmbient();
    },
    layers() {
      return [...currentLayers];
    },
    victoryMsLeft() {
      return victoryLeft;
    },
    play(request) {
      const clipId = resolveClipId(request.clipId, request.actor ?? 'player');
      const channelVolume = isAudioChannel(request.channel) ? volumes[request.channel] : 0;
      sink.play(clipId, mix({ [request.channel]: channelVolume }, request.gain ?? 1));
      const key = request.subtitleKey;
      if (subtitles && typeof key === 'string' && key.length > 0) {
        events.push({ type: 'subtitle', text: key });
      }
    },
    stop(clipId) {
      sink.stop(clipId);
      if (currentLayers.includes(clipId)) {
        currentLayers = currentLayers.filter((layer) => layer !== clipId);
      }
      if (activeAmbient === clipId) {
        activeAmbient = null;
        appliedAmbientGain = Number.NaN;
      }
    },
    takeEvents() {
      return events.splice(0, events.length);
    },
  };
}
