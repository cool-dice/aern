import type { Server as HttpServer } from 'node:http';
import { createRequire } from 'node:module';
import {
  COMMAND_RATE_LIMIT,
  COMMAND_RATE_WINDOW_MS,
  COMMAND_STALE_WINDOW_MS,
  parseClientCommand,
  type ClientCommand,
  type RejectCode,
  type RejectedCommand,
  type ServerMessage,
} from '@rift/protocol';
import {
  rememberCommand,
  seenCommand,
  validateClientCommand,
  type ValidateCode,
  type ValidateInput,
} from '../../sim/validate';
import { commandSignatureMatches } from './hmac';

export { signCommand } from './hmac';

/**
 * A command issued more than this far ahead of the server clock is `stale`.
 * `validateCommand` does not apply this skew.
 */
export const COMMAND_FUTURE_SKEW_MS = 2000;

/** Reconnect log keeps this many server messages per session. */
export const RESUME_LIMIT = 50;

export type GatewayRules = Omit<ValidateInput, 'action' | 'commandId'>;

/**
 * Protocol gate for one connection.
 * `nowMs` is the caller's clock reading for this message. Do not read `Date.now` here.
 * `rules`, when set, is the world snapshot passed to `validateClientCommand`.
 */
export interface GatewayCtx {
  nowMs: number;
  verifyAccess: (
    token: string,
  ) => { ok: true; value: { accountId: string; role: string } } | { ok: false; code: 'token' };
  sessionKey: (accountId: string) => string | null;
  seen: Set<string>;
  rateTimestamps: number[];
  enqueue: (command: ClientCommand) => void;
  rules?: GatewayRules;
}

export type HandleResult =
  | { ok: true; command: ClientCommand }
  | {
      ok: false;
      reject: RejectedCommand;
      rule?: ValidateCode;
      cheatStrike?: boolean;
    };

export interface GatewaySocket {
  on(event: 'message', listener: (raw: string) => void): void;
  send(data: string): void;
}

export interface ResumeLog {
  record(sessionId: string, message: ServerMessage): void;
  resume(
    sessionId: string,
  ): { ok: true; messages: ServerMessage[] } | { ok: false; code: 'session' };
}

/**
 * Accept a JSON command frame.
 * Wire object: `{ channel: 'command', accessToken, command, signature }`.
 * `accessToken` is an access JWT. `signature` is hex HMAC from `signCommand`.
 */
export function handleMessage(raw: string, ctx: GatewayCtx): HandleResult {
  const parsed = parseFrame(raw);
  if (!parsed.ok) {
    return protocolReject(parsed.commandId, 'invalid');
  }

  const { command } = parsed.frame;
  const access = ctx.verifyAccess(parsed.frame.accessToken);
  if (!access.ok) {
    return protocolReject(command.commandId, 'invalid');
  }

  const keyHex = ctx.sessionKey(access.value.accountId);
  if (keyHex === null || !commandSignatureMatches(command, keyHex, parsed.frame.signature)) {
    return protocolReject(command.commandId, 'bad_signature');
  }

  if (seenCommand(ctx.seen, command.commandId)) {
    return protocolReject(command.commandId, 'duplicate');
  }

  if (isStale(command.issuedAtMs, ctx.nowMs)) {
    return protocolReject(command.commandId, 'stale');
  }

  const recent = timestampsInWindow(ctx.rateTimestamps, ctx.nowMs);
  if (recent.length >= COMMAND_RATE_LIMIT) {
    replaceAll(ctx.rateTimestamps, recent);
    return protocolReject(command.commandId, 'rate_limited');
  }
  recent.push(ctx.nowMs);
  replaceAll(ctx.rateTimestamps, recent);

  if (ctx.rules !== undefined) {
    const decision = validateClientCommand(command, { ...ctx.rules, seen: ctx.seen });
    if (!decision.ok) {
      return {
        ok: false,
        reject: { channel: 'system', commandId: command.commandId, code: 'invalid' },
        rule: decision.code,
        cheatStrike: decision.cheatStrike,
      };
    }
  }

  ctx.enqueue(command);
  remember(ctx.seen, command.commandId);
  return { ok: true, command };
}

/** Test double: a fake `{ on, send }` pair. Does not bind a port. */
export function bindSocket(socket: GatewaySocket, ctx: GatewayCtx): void {
  socket.on('message', (raw) => {
    const result = handleMessage(raw, ctx);
    if (!result.ok) {
      socket.send(JSON.stringify(result.reject));
    }
  });
}

/** Builds a State message. Does not write to a socket. */
export function broadcastState(tick: number, payload: unknown, sentAtMs: number): ServerMessage {
  return {
    channel: 'state',
    serverTick: tick,
    sentAtMs,
    payload,
  };
}

export function createResumeLog(): ResumeLog {
  const buffers = new Map<string, ServerMessage[]>();
  return {
    record(sessionId, message) {
      const bucket = buffers.get(sessionId) ?? [];
      bucket.push(message);
      while (bucket.length > RESUME_LIMIT) {
        bucket.shift();
      }
      buffers.set(sessionId, bucket);
    },
    resume(sessionId) {
      const bucket = buffers.get(sessionId);
      if (bucket === undefined) {
        return { ok: false, code: 'session' };
      }
      return { ok: true, messages: bucket.slice() };
    },
  };
}

/**
 * Attach the WebSocket adapter to an HTTP server.
 * TLS terminates at an external proxy. Startup listens without TLS on localhost.
 * Production still requires TLS; that termination is not part of this process.
 * `ws` is loaded only when this function runs, so unit tests that never call it do not open a port.
 */
export function attach(server: HttpServer): import('ws').WebSocketServer {
  const ws = createRequire(import.meta.url)('ws') as typeof import('ws');
  return new ws.WebSocketServer({ server });
}

function protocolReject(commandId: string, code: RejectCode): HandleResult {
  return { ok: false, reject: { channel: 'system', commandId, code } };
}

function isStale(issuedAtMs: number, nowMs: number): boolean {
  if (nowMs - issuedAtMs > COMMAND_STALE_WINDOW_MS) {
    return true;
  }
  return issuedAtMs > nowMs + COMMAND_FUTURE_SKEW_MS;
}

function timestampsInWindow(timestamps: readonly number[], nowMs: number): number[] {
  const recent: number[] = [];
  for (const ts of timestamps) {
    if (nowMs - ts < COMMAND_RATE_WINDOW_MS) {
      recent.push(ts);
    }
  }
  return recent;
}

function replaceAll(target: number[], next: readonly number[]): void {
  target.length = 0;
  for (const ts of next) {
    target.push(ts);
  }
}

function remember(seen: Set<string>, commandId: string): void {
  const next = rememberCommand(seen, commandId);
  for (const id of next) {
    seen.add(id);
  }
}

interface CommandFrame {
  accessToken: string;
  command: ClientCommand;
  signature: string;
}

function parseFrame(
  raw: string,
): { ok: true; frame: CommandFrame } | { ok: false; commandId: string } {
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return { ok: false, commandId: '' };
  }
  const commandId = commandIdOf(body);
  if (!isRecord(body) || body.channel !== 'command') {
    return { ok: false, commandId };
  }
  if (typeof body.accessToken !== 'string' || body.accessToken.length === 0) {
    return { ok: false, commandId };
  }
  if (typeof body.signature !== 'string') {
    return { ok: false, commandId };
  }
  const command = parseClientCommand(body.command);
  if (command === null) {
    return { ok: false, commandId };
  }
  return {
    ok: true,
    frame: {
      accessToken: body.accessToken,
      command,
      signature: body.signature,
    },
  };
}

function commandIdOf(body: unknown): string {
  if (!isRecord(body) || !isRecord(body.command)) {
    return '';
  }
  const commandId = body.command.commandId;
  return typeof commandId === 'string' ? commandId : '';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
