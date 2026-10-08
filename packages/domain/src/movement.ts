import { ok, err, type Result } from './result';
import { derive, emptyPoints } from './stats';
import { SIM_TICK_MS } from './time';

/**
 * Integer grid. Eight neighbors, Chebyshev: a diagonal is one cell, same as a cardinal.
 * Axes: +x east, +y south. North decreases y. `Dir` is the facing of a step.
 * `step` moves one cell. A combat step or run is `move` (`running` false or true).
 * There is no separate `run` function.
 */

export const DIRS = ['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw'] as const;
export type Dir = (typeof DIRS)[number];

export interface Cell {
  x: number;
  y: number;
}

/** Downed crawl is one cell per call. The gap between crawls is 3 seconds (30 sim ticks). */
export const DOWNED_CRAWL_MS = 30 * SIM_TICK_MS;

const DELTA: Record<Dir, Cell> = {
  n: { x: 0, y: -1 },
  ne: { x: 1, y: -1 },
  e: { x: 1, y: 0 },
  se: { x: 1, y: 1 },
  s: { x: 0, y: 1 },
  sw: { x: -1, y: 1 },
  w: { x: -1, y: 0 },
  nw: { x: -1, y: -1 },
};

const STEP_OD_COST = 1;

export function step(from: Cell, dir: Dir): Cell {
  const delta = DELTA[dir];
  return { x: from.x + delta.x, y: from.y + delta.y };
}

export function chebyshev(a: Cell, b: Cell): number {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
}

export function cellsFor(input: {
  reaction: number;
  running: boolean;
  overloaded: boolean;
  legsDestroyed: 0 | 1 | 2;
  downed: boolean;
}): number {
  if (input.legsDestroyed === 2) {
    return 0;
  }
  if (input.downed) {
    return 1;
  }
  if (input.running && input.overloaded) {
    return 0;
  }
  const pace = paceFor(input.reaction);
  const base = input.running ? pace.cellsPerRun : pace.cellsPerStep;
  if (input.legsDestroyed === 1) {
    if (base < 1) {
      return 0;
    }
    return Math.max(1, Math.floor(base * 0.5));
  }
  return base;
}

export type MoveError = 'od' | 'blocked' | 'legs' | 'overload_run' | 'downed';

export function move(input: {
  from: Cell;
  dir: Dir;
  inCombat: boolean;
  od: number;
  reaction: number;
  running: boolean;
  overloaded: boolean;
  legsDestroyed: 0 | 1 | 2;
  downed: boolean;
  blocked: (cell: Cell) => boolean;
}): Result<{ cell: Cell; od: number; cells: number }, MoveError> {
  if (input.running && input.overloaded) {
    return err('overload_run');
  }
  if (input.running && input.downed) {
    return err('downed');
  }

  const budget = cellsFor(input);
  if (budget < 1) {
    return err('legs');
  }

  const cost = odCost(input);
  if (input.od < cost) {
    return err('od');
  }

  let cell = input.from;
  let walked = 0;
  for (let i = 0; i < budget; i += 1) {
    const next = step(cell, input.dir);
    if (input.blocked(next)) {
      break;
    }
    cell = next;
    walked += 1;
  }

  if (walked === 0) {
    return err('blocked');
  }

  return ok({ cell, od: input.od - cost, cells: walked });
}

/**
 * BFS over the eight neighbors. `limit` is the maximum number of nodes in the
 * path, including the start and the goal. Equal-length paths prefer the first
 * direction in `DIRS` (n, ne, e, se, s, sw, w, nw). Diagonals are not blocked
 * by occupied orthogonal corners.
 */
export function shortestPath(
  from: Cell,
  to: Cell,
  blocked: (cell: Cell) => boolean,
  limit: number,
): Cell[] | null {
  if (limit < 1) {
    return null;
  }
  if (sameCell(from, to)) {
    return [{ x: from.x, y: from.y }];
  }
  if (blocked(to)) {
    return null;
  }

  const startKey = keyOf(from);
  const parent = new Map<string, string | null>();
  const coords = new Map<string, Cell>();
  parent.set(startKey, null);
  coords.set(startKey, { x: from.x, y: from.y });

  const queue: { key: string; nodes: number }[] = [{ key: startKey, nodes: 1 }];
  let head = 0;

  while (head < queue.length) {
    const current = queue[head];
    head += 1;
    if (current === undefined) {
      break;
    }
    const currentCell = coords.get(current.key);
    if (currentCell === undefined) {
      break;
    }
    for (const dir of DIRS) {
      const next = step(currentCell, dir);
      const nextKey = keyOf(next);
      if (parent.has(nextKey) || blocked(next)) {
        continue;
      }
      const nextNodes = current.nodes + 1;
      if (nextNodes > limit) {
        continue;
      }
      parent.set(nextKey, current.key);
      coords.set(nextKey, next);
      if (sameCell(next, to)) {
        return reconstruct(parent, coords, nextKey);
      }
      queue.push({ key: nextKey, nodes: nextNodes });
    }
  }

  return null;
}

export function escaped(input: { origin: Cell; position: Cell; enemies: Cell[] }): boolean {
  if (chebyshev(input.origin, input.position) <= 15) {
    return false;
  }
  return input.enemies.every((enemy) => chebyshev(input.position, enemy) >= 10);
}

function paceFor(reaction: number): { cellsPerStep: number; cellsPerRun: number; runOdCost: 3 } {
  const derived = derive({
    stats: { ...emptyPoints(), reaction },
    level: 1,
    totalWeightKg: 0,
  });
  return {
    cellsPerStep: derived.cellsPerStep,
    cellsPerRun: derived.cellsPerRun,
    runOdCost: derived.runOdCost,
  };
}

function odCost(input: { inCombat: boolean; running: boolean; reaction: number }): number {
  void input.inCombat;
  if (input.running) {
    return paceFor(input.reaction).runOdCost;
  }
  return STEP_OD_COST;
}

function sameCell(a: Cell, b: Cell): boolean {
  return a.x === b.x && a.y === b.y;
}

function keyOf(cell: Cell): string {
  return `${cell.x},${cell.y}`;
}

function reconstruct(
  parent: Map<string, string | null>,
  coords: Map<string, Cell>,
  goalKey: string,
): Cell[] {
  const path: Cell[] = [];
  let cursor: string | null = goalKey;
  while (cursor !== null) {
    const cell = coords.get(cursor);
    if (cell === undefined) {
      break;
    }
    path.push(cell);
    const previous = parent.get(cursor);
    cursor = previous === undefined ? null : previous;
  }
  path.reverse();
  return path;
}
