/** Frequency for a generated cue when no ogg clip exists. */
export function oscillatorFrequency(event: string): number {
  if (event === 'damage') {
    return 220;
  }
  if (event === 'hit') {
    return 660;
  }
  return 440;
}

interface ToneContext {
  destination: unknown;
  currentTime: number;
  createOscillator(): {
    frequency: { value: number };
    connect(node: unknown): void;
    start(): void;
    stop(when: number): void;
  };
  close(): void;
}

/**
 * Starts a short oscillator when the browser exposes `AudioContext`.
 * Unit tests without that constructor report `started: false` and still name the frequency.
 */
export function startGeneratedTone(event: string): { frequency: number; started: boolean } {
  const frequency = oscillatorFrequency(event);
  const host = globalThis as { AudioContext?: new () => ToneContext };
  if (host.AudioContext === undefined) {
    return { frequency, started: false };
  }
  const context = new host.AudioContext();
  const oscillator = context.createOscillator();
  oscillator.frequency.value = frequency;
  oscillator.connect(context.destination);
  oscillator.start();
  oscillator.stop(context.currentTime + 0.05);
  return { frequency, started: true };
}
