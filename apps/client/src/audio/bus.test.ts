import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';
import {
  AMBIENT_DAY_ID,
  AMBIENT_NIGHT_ID,
  AUDIO_CHANNELS,
  AUDIO_MANIFEST,
  VICTORY_HOLD_MS,
  type AudioFrame,
  type MusicSituation,
  ambientClipId,
  createAudioBus,
  createMemorySink,
  layersFor,
  mix,
  resolveClipId,
} from './bus';

const busSource = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'bus.ts'), 'utf8');

function situation(overrides: Partial<MusicSituation> = {}): MusicSituation {
  return {
    inCombat: false,
    city: false,
    dungeon: false,
    hpRatio: 1,
    boss: false,
    victoryMsLeft: 0,
    ...overrides,
  };
}

function frame(overrides: Partial<AudioFrame> = {}): AudioFrame {
  return {
    nowMs: 0,
    inCombat: false,
    city: false,
    dungeon: false,
    hpRatio: 1,
    boss: false,
    ...overrides,
  };
}

test('city outside combat is base and melody, without rhythm', () => {
  const layers = layersFor(situation({ city: true, inCombat: false }));
  expect(layers).toEqual(['base', 'melody']);
  expect(layers).not.toContain('rhythm');
});

test('combat is base and rhythm', () => {
  expect(layersFor(situation({ inCombat: true }))).toEqual(['base', 'rhythm']);
});

test('hp 0.2 in combat includes tension and still includes rhythm', () => {
  const layers = layersFor(situation({ inCombat: true, hpRatio: 0.2 }));
  expect(layers).toContain('tension');
  expect(layers).toEqual(['base', 'rhythm', 'tension']);
});

test('victoryMsLeft 1000 includes victory and excludes rhythm', () => {
  const layers = layersFor(situation({ inCombat: true, victoryMsLeft: 1000 }));
  expect(layers).toContain('victory');
  expect(layers).not.toContain('rhythm');
  expect(layers).toEqual(['base', 'victory']);
});

test('mix of 2 and 2 clips to 1, and a negative factor clips to 0', () => {
  expect(mix({ music: 2 }, 2)).toBe(1);
  expect(mix({ music: -1 }, 1)).toBe(0);
  expect(mix({}, -1)).toBe(0);
});

test('ambient at night is ambient_night', () => {
  expect(ambientClipId('night')).toBe('ambient_night');
  expect(ambientClipId('night')).toBe(AMBIENT_NIGHT_ID);
});

test('mix multiplies then clips, and a non-number is 0', () => {
  expect(mix({ music: 0.5 }, 0.5)).toBe(0.25);
  expect(mix({ music: 0.5 }, 2)).toBe(1);
  expect(mix({ music: 1 }, -0.2)).toBe(0);
  expect(mix({ music: Number.NaN }, 1)).toBe(0);
  expect(mix({ music: 1 }, Number.POSITIVE_INFINITY)).toBe(0);
  expect(mix({ effects: '2' as unknown as number }, 1)).toBe(0);
  expect(mix({}, 0.4)).toBe(0.4);
});

test('layers stack unless victory and combat collapse to base and victory', () => {
  expect(layersFor(situation({ dungeon: true }))).toEqual(['base', 'atmosphere']);
  expect(layersFor(situation({ boss: true }))).toEqual(['base', 'tension']);
  expect(layersFor(situation({ hpRatio: 0.3 }))).toEqual(['base']);
  expect(layersFor(situation({ hpRatio: 0 }))).toEqual(['base', 'tension']);
  expect(layersFor(situation({ city: true, dungeon: true }))).toEqual([
    'base',
    'melody',
    'atmosphere',
  ]);
  expect(layersFor(situation({ inCombat: true, city: true, hpRatio: 0.2 }))).toEqual([
    'base',
    'rhythm',
    'melody',
    'tension',
  ]);
  expect(
    layersFor(
      situation({ inCombat: true, victoryMsLeft: 1, city: true, hpRatio: 0.2, boss: true }),
    ),
  ).toEqual(['base', 'victory']);
  expect(layersFor(situation({ victoryMsLeft: 1000, city: true }))).toEqual([
    'base',
    'melody',
    'victory',
  ]);
  expect(layersFor(situation({ victoryMsLeft: 0, inCombat: true }))).not.toContain('victory');
});

test('day and night only change the ambient id', () => {
  expect(ambientClipId('day')).toBe(AMBIENT_DAY_ID);
  expect(ambientClipId('day')).toBe('ambient_day');
  const daytime = layersFor(situation({ city: true }));
  const nighttime = layersFor(situation({ city: true }));
  expect(nighttime).toEqual(daytime);
});

test('manifest records ogg at 44.1 kHz and does not decode', () => {
  expect(AUDIO_MANIFEST.format).toBe('ogg');
  expect(AUDIO_MANIFEST.sampleRateHz).toBe(44_100);
  expect(AUDIO_CHANNELS).toEqual(['music', 'effects', 'ambient', 'voice', 'ui']);
  expect(busSource).not.toMatch(/\bdecode\b/);
});

test('bus.ts does not import the Web Audio API or read the wall clock', () => {
  expect(busSource).not.toMatch(/AudioContext/);
  expect(busSource).not.toMatch(/webkitAudioContext/);
  expect(busSource).not.toMatch(/from\s+['"][^'"]*(howler|standardized-audio)/);
  expect(busSource).not.toContain('Date.now');
  expect(busSource).not.toContain('performance.now');
});

test('bots resolve to the same clip id as the player', () => {
  expect(resolveClipId('swing', 'bot')).toBe('swing');
  expect(resolveClipId('swing', 'bot')).toBe(resolveClipId('swing', 'player'));
});

describe('audio bus', () => {
  test('plays the night ambient bed through the memory sink', () => {
    const sink = createMemorySink();
    const bus = createAudioBus(sink);
    expect(bus.ambientId()).toBe('ambient_day');
    bus.setPhase('night');
    expect(bus.ambientId()).toBe('ambient_night');
    expect(bus.phase()).toBe('night');
    expect(sink.playing()).toEqual({ ambient_night: 1 });
    bus.setPhase('day');
    expect(sink.playing()).toEqual({ ambient_day: 1 });
  });

  test('selects layers from an injected clock and drops victory after 30s', () => {
    const sink = createMemorySink();
    const bus = createAudioBus(sink);
    bus.update(frame({ nowMs: 0, inCombat: true }));
    expect(bus.layers()).toEqual(['base', 'rhythm']);
    expect(sink.playing()).toEqual({ base: 1, rhythm: 1, ambient_day: 1 });

    bus.update(frame({ nowMs: 1_000, inCombat: false, city: true }));
    expect(bus.victoryMsLeft()).toBe(VICTORY_HOLD_MS);
    expect(bus.layers()).toEqual(['base', 'melody', 'victory']);
    expect(bus.layers()).not.toContain('rhythm');

    bus.update(frame({ nowMs: 1_000 + VICTORY_HOLD_MS - 1, inCombat: false, city: true }));
    expect(bus.layers()).toContain('victory');

    bus.update(frame({ nowMs: 1_000 + VICTORY_HOLD_MS, inCombat: false, city: true }));
    expect(bus.victoryMsLeft()).toBe(0);
    expect(bus.layers()).toEqual(['base', 'melody']);
    expect(sink.playing().victory).toBeUndefined();
    expect(sink.playing().rhythm).toBeUndefined();
  });

  test('victory keeps priority when combat resumes before the hold ends', () => {
    const bus = createAudioBus(createMemorySink());
    bus.update(frame({ nowMs: 0, inCombat: true, hpRatio: 0.2 }));
    expect(bus.layers()).toEqual(['base', 'rhythm', 'tension']);
    bus.update(frame({ nowMs: 500, inCombat: false }));
    bus.update(frame({ nowMs: 800, inCombat: true, hpRatio: 0.2, boss: true }));
    expect(bus.layers()).toEqual(['base', 'victory']);
    expect(bus.layers()).not.toContain('rhythm');
    expect(bus.layers()).not.toContain('tension');
  });

  test('an identical frame does not restart clips', () => {
    const sink = createMemorySink();
    const bus = createAudioBus(sink);
    bus.update(frame({ nowMs: 0, city: true }));
    const calls = sink.calls().length;
    bus.update(frame({ nowMs: 100, city: true }));
    expect(sink.calls().length).toBe(calls);
  });

  test('channel volume mixes into the sink gain and clips', () => {
    const sink = createMemorySink();
    const bus = createAudioBus(sink);
    bus.setVolume('ui', 0.5);
    bus.play({ clipId: 'click', channel: 'ui', gain: 0.5 });
    expect(sink.playing().click).toBe(0.25);
    bus.setVolume('effects', 2);
    expect(bus.volume('effects')).toBe(1);
    bus.play({ clipId: 'swing', channel: 'effects', gain: 2, actor: 'player' });
    bus.play({ clipId: 'swing', channel: 'effects', gain: 2, actor: 'bot' });
    expect(sink.playing().swing).toBe(1);
    bus.setVolume('voice', Number.NaN);
    expect(bus.volume('voice')).toBe(0);
  });

  test('music and ambient gains follow the channel sliders', () => {
    const sink = createMemorySink();
    const bus = createAudioBus(sink);
    bus.update(frame({ nowMs: 0, city: true }));
    bus.setVolume('music', 0.5);
    bus.setVolume('ambient', 0.25);
    expect(sink.playing().base).toBe(0.5);
    expect(sink.playing().melody).toBe(0.5);
    expect(sink.playing().ambient_day).toBe(0.25);
  });

  test('subtitles emit the localization key only when enabled', () => {
    const bus = createAudioBus(createMemorySink());
    bus.play({ clipId: 'greet', channel: 'voice', subtitleKey: 'npc.greet', actor: 'bot' });
    expect(bus.takeEvents()).toEqual([]);
    bus.setSubtitles(true);
    expect(bus.subtitlesEnabled()).toBe(true);
    bus.play({ clipId: 'greet', channel: 'voice', subtitleKey: 'npc.greet', actor: 'player' });
    bus.play({ clipId: 'hit', channel: 'effects' });
    expect(bus.takeEvents()).toEqual([{ type: 'subtitle', text: 'npc.greet' }]);
    expect(bus.takeEvents()).toEqual([]);
  });

  test('stopping a one-shot leaves the music bed in place', () => {
    const sink = createMemorySink();
    const bus = createAudioBus(sink);
    bus.update(frame({ nowMs: 0, inCombat: true }));
    bus.play({ clipId: 'swing', channel: 'effects' });
    bus.stop('swing');
    expect(sink.playing().swing).toBeUndefined();
    expect(sink.playing().base).toBe(1);
    expect(sink.playing().rhythm).toBe(1);
  });

  test('night does not change the selected music layers', () => {
    const bus = createAudioBus(createMemorySink());
    bus.update(frame({ nowMs: 0, city: true, dungeon: true }));
    const before = bus.layers();
    bus.setPhase('night');
    expect(bus.layers()).toEqual(before);
    expect(bus.ambientId()).toBe('ambient_night');
  });
});
