import { createHmac } from 'node:crypto';
import {
  COMMAND_STALE_WINDOW_MS,
  canonicalCommand,
  type ClientCommand,
  type SignedEnvelope,
} from '@rift/protocol';

/**
 * HMAC-SHA256 of the protocol canonical command.
 * The key is the session secret's raw bytes (hex). Node tests use `node:crypto`
 * because WebCrypto is not available here; the signed bytes are the same string.
 */
export function sign(command: ClientCommand, sessionKeyHex: string): string {
  const key = Buffer.from(sessionKeyHex, 'hex');
  return createHmac('sha256', key).update(canonicalCommand(command), 'utf8').digest('hex');
}

export function enqueue(command: ClientCommand, sessionKeyHex: string): SignedEnvelope {
  return {
    channel: 'command',
    command: {
      ...command,
      params: { ...command.params },
    },
    signature: sign(command, sessionKeyHex),
  };
}

/** `true` when `issuedAtMs` is older than the protocol stale window (5000 ms). */
export function isCommandStale(issuedAtMs: number, nowMs: number): boolean {
  return nowMs - issuedAtMs > COMMAND_STALE_WINDOW_MS;
}

/** Monotonic command seq starting at 1. */
export function createSeq(): { next(): number } {
  let seq = 0;
  return {
    next() {
      seq += 1;
      return seq;
    },
  };
}

export interface OutboundQueue {
  readonly lastSeq: number;
  /** Signs a command that already carries the next seq (1, then 2, …). */
  accept(command: ClientCommand): SignedEnvelope | null;
  /** Assigns the next seq, signs, and returns the envelope. */
  issue(command: Omit<ClientCommand, 'seq'>): SignedEnvelope;
}

export function createOutboundQueue(sessionKeyHex: string): OutboundQueue {
  let lastSeq = 0;
  return {
    get lastSeq() {
      return lastSeq;
    },
    accept(command) {
      if (command.seq !== lastSeq + 1) {
        return null;
      }
      const envelope = enqueue(command, sessionKeyHex);
      lastSeq = command.seq;
      return envelope;
    },
    issue(command) {
      const seq = lastSeq + 1;
      const envelope = enqueue({ ...command, seq }, sessionKeyHex);
      lastSeq = seq;
      return envelope;
    },
  };
}

export interface CommandSocket {
  send(data: string): void;
  close(): void;
}

export interface MemorySocket extends CommandSocket {
  sent: string[];
  closed: boolean;
}

/** In-memory transport. It does not open a port. */
export function createMemorySocket(): MemorySocket {
  const socket: MemorySocket = {
    sent: [],
    closed: false,
    send(data) {
      if (socket.closed) {
        return;
      }
      socket.sent.push(data);
    },
    close() {
      socket.closed = true;
    },
  };
  return socket;
}

export function sendEnvelope(socket: CommandSocket, envelope: SignedEnvelope): void {
  socket.send(JSON.stringify(envelope));
}
