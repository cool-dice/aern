import type { Channel } from './channels';
import type { ClientCommand } from './commands';

export const REJECT_CODES = [
  'bad_signature',
  'duplicate',
  'stale',
  'rate_limited',
  'invalid',
  'feature_stub',
] as const;

export type RejectCode = (typeof REJECT_CODES)[number];

export interface SignedEnvelope {
  channel: 'command';
  command: ClientCommand;
  signature: string;
}

export interface ServerMessage {
  channel: Channel;
  serverTick: number;
  sentAtMs: number;
  payload: unknown;
}

export interface RejectedCommand {
  channel: 'system';
  commandId: string;
  code: RejectCode;
}
