import { DIRS, move, type Cell, type Dir } from '@rift/domain/movement';

/** Unconfirmed local steps are replayed for this long, then dropped. */
export const PREDICTION_BUFFER_MS = 500;
export const INTERPOLATION_DELAY_MS = 100;
export const EXTRAPOLATION_LIMIT_MS = 200;

export interface PendingStep {
  seq: number;
  dir: Dir;
  atMs: number;
  running?: boolean;
}

export interface ProjectedStep {
  seq: number;
  dir: Dir;
  atMs: number;
  running: boolean;
  cell: Cell;
}

const DIR_SUFFIX = 'ne|nw|se|sw|n|s|e|w';
const MOVE_ACTION = new RegExp(`^(step|run)_(${DIR_SUFFIX})$`);

function isDir(value: string): value is Dir {
  return (DIRS as readonly string[]).includes(value);
}

function parseMove(action: string, dir: Dir | undefined): { dir: Dir; running: boolean } | null {
  if (action === 'step' || action === 'run') {
    if (dir === undefined) {
      return null;
    }
    return { dir, running: action === 'run' };
  }
  const match = MOVE_ACTION.exec(action);
  const kind = match?.[1];
  const suffix = match?.[2];
  if ((kind !== 'step' && kind !== 'run') || suffix === undefined || !isDir(suffix)) {
    return null;
  }
  return { dir: suffix, running: kind === 'run' };
}

/**
 * Records a local step or run. Any other action, including `attack_*`, is ignored
 * and the same pending array is returned.
 */
export function noteLocal(
  pending: PendingStep[],
  action: string,
  stamp: { seq: number; atMs: number; dir?: Dir },
): PendingStep[] {
  const parsed = parseMove(action, stamp.dir);
  if (!parsed) {
    return pending;
  }
  return [
    ...pending,
    {
      seq: stamp.seq,
      dir: parsed.dir,
      atMs: stamp.atMs,
      running: parsed.running,
    },
  ];
}

/**
 * Attacks are not predicted. The returned hp is the hp passed in.
 */
export function applyLocal<T extends { hp: number }>(action: string, state: T): T {
  if (action.startsWith('attack')) {
    return { ...state, hp: state.hp };
  }
  return { ...state, hp: state.hp };
}

function clamp01(t: number): number {
  if (t <= 0) {
    return 0;
  }
  if (t >= 1) {
    return 1;
  }
  return t;
}

/** Linear blend of two points. `t` is clamped to 0..1. */
export function interpolate(
  a: { x: number; y: number },
  b: { x: number; y: number },
  t: number,
): { x: number; y: number } {
  const clamped = clamp01(t);
  return {
    x: a.x + (b.x - a.x) * clamped,
    y: a.y + (b.y - a.y) * clamped,
  };
}

/**
 * Continues the last segment's velocity for at most 200 ms, then stands.
 * `lateMs` is how far `now` is past the latest sample. `spanMs` is the gap
 * between the previous sample and the latest one.
 */
export function extrapolate(input: {
  previous: { x: number; y: number };
  latest: { x: number; y: number };
  spanMs: number;
  lateMs: number;
}): { x: number; y: number } {
  if (!(input.spanMs > 0) || !(input.lateMs > 0)) {
    return { x: input.latest.x, y: input.latest.y };
  }
  const extra = Math.min(input.lateMs, EXTRAPOLATION_LIMIT_MS);
  const scale = extra / input.spanMs;
  return {
    x: input.latest.x + (input.latest.x - input.previous.x) * scale,
    y: input.latest.y + (input.latest.y - input.previous.y) * scale,
  };
}

/**
 * Other entities render 100 ms behind `nowMs`. Past the latest sample, motion
 * extrapolates for at most 200 ms and then holds.
 */
export function interpolateEntity(input: {
  from: { x: number; y: number };
  to: { x: number; y: number };
  fromMs: number;
  toMs: number;
  nowMs: number;
}): { x: number; y: number } {
  const at = input.nowMs - INTERPOLATION_DELAY_MS;
  const span = input.toMs - input.fromMs;
  if (!(span > 0) || at >= input.toMs) {
    return extrapolate({
      previous: input.from,
      latest: input.to,
      spanMs: span,
      lateMs: at - input.toMs,
    });
  }
  if (at <= input.fromMs) {
    return { x: input.from.x, y: input.from.y };
  }
  return interpolate(input.from, input.to, (at - input.fromMs) / span);
}

export interface Replay<T extends PendingStep> {
  cell: Cell;
  pending: T[];
  steps: ProjectedStep[];
}

/**
 * Rolls back to `serverCell` and replays pending steps with `now - at <= 500`.
 * A domain `move` error drops that step. Older steps are discarded.
 * Open ground: no blockers, intact legs, not overloaded, not downed.
 */
export function projectMoves<T extends PendingStep>(input: {
  serverCell: { x: number; y: number };
  pending: readonly T[];
  nowMs: number;
  reaction: number;
  inCombat: boolean;
  od: number;
}): Replay<T> {
  const ordered = [...input.pending].sort((a, b) => a.seq - b.seq);
  let cell: Cell = { x: input.serverCell.x, y: input.serverCell.y };
  let od = input.od;
  const pending: T[] = [];
  const steps: ProjectedStep[] = [];

  for (const item of ordered) {
    if (input.nowMs - item.atMs > PREDICTION_BUFFER_MS) {
      continue;
    }
    if (!isDir(item.dir)) {
      continue;
    }
    const running = item.running === true;
    const result = move({
      from: cell,
      dir: item.dir,
      inCombat: input.inCombat,
      od,
      reaction: input.reaction,
      running,
      overloaded: false,
      legsDestroyed: 0,
      downed: false,
      blocked: () => false,
    });
    if (!result.ok) {
      continue;
    }
    cell = { x: result.value.cell.x, y: result.value.cell.y };
    od = result.value.od;
    pending.push(item);
    steps.push({
      seq: item.seq,
      dir: item.dir,
      atMs: item.atMs,
      running,
      cell: { x: cell.x, y: cell.y },
    });
  }

  return { cell, pending, steps };
}

export function reconcile<T extends PendingStep>(input: {
  serverCell: { x: number; y: number };
  pending: T[];
  nowMs: number;
  reaction: number;
  inCombat: boolean;
  od: number;
}): { cell: { x: number; y: number }; pending: T[] } {
  const played = projectMoves(input);
  return { cell: played.cell, pending: played.pending };
}
