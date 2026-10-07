export const CHANNELS = ['state', 'command', 'chat', 'market', 'social', 'system'] as const;

export type Channel = (typeof CHANNELS)[number];

export function isChannel(value: unknown): value is Channel {
  return typeof value === 'string' && (CHANNELS as readonly string[]).includes(value);
}
