export const COMMAND_RATE_LIMIT = 30;
export const COMMAND_RATE_WINDOW_MS = 1000;

/** Commands older than this many milliseconds relative to the server are `stale`. */
export const COMMAND_STALE_WINDOW_MS = 5000;

export type CommandScalar = string | number | boolean | null;

export interface ClientCommand {
  commandId: string;
  seq: number;
  issuedAtMs: number;
  action: string;
  targetId?: string;
  params: Record<string, CommandScalar>;
}

const ACTION_PATTERN = /^[a-z0-9_]{1,64}$/;

function isCommandScalar(value: unknown): value is CommandScalar {
  if (value === null) {
    return true;
  }
  if (typeof value === 'string' || typeof value === 'boolean') {
    return true;
  }
  return typeof value === 'number' && Number.isFinite(value);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function canonicalCommand(command: ClientCommand): string {
  const params: Record<string, CommandScalar> = {};
  for (const key of Object.keys(command.params).sort()) {
    const value = command.params[key];
    if (value !== undefined) {
      params[key] = value;
    }
  }

  const ordered: Record<string, unknown> = {
    commandId: command.commandId,
    seq: command.seq,
    issuedAtMs: command.issuedAtMs,
    action: command.action,
  };
  if (command.targetId !== undefined) {
    ordered.targetId = command.targetId;
  }
  ordered.params = params;
  return JSON.stringify(ordered);
}

export function parseClientCommand(input: unknown): ClientCommand | null {
  if (!isPlainObject(input)) {
    return null;
  }
  if (typeof input.commandId !== 'string' || input.commandId.length === 0) {
    return null;
  }
  if (typeof input.seq !== 'number' || !Number.isInteger(input.seq) || input.seq < 1) {
    return null;
  }
  if (typeof input.issuedAtMs !== 'number' || !Number.isFinite(input.issuedAtMs)) {
    return null;
  }
  if (typeof input.action !== 'string' || !ACTION_PATTERN.test(input.action)) {
    return null;
  }
  if (!isPlainObject(input.params)) {
    return null;
  }

  const params: Record<string, CommandScalar> = {};
  for (const key of Object.keys(input.params)) {
    const value = input.params[key];
    if (!isCommandScalar(value)) {
      return null;
    }
    params[key] = value;
  }

  const command: ClientCommand = {
    commandId: input.commandId,
    seq: input.seq,
    issuedAtMs: input.issuedAtMs,
    action: input.action,
    params,
  };

  if (input.targetId !== undefined) {
    if (typeof input.targetId !== 'string' || input.targetId.length === 0) {
      return null;
    }
    command.targetId = input.targetId;
  }

  return command;
}
