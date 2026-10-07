import { expect, test } from 'vitest';
import { err, ok } from './result';
import { derive, emptyPoints } from './stats';
import { SIM_TICK_MS } from './time';
import {
  DIRS,
  DOWNED_CRAWL_MS,
  cellsFor,
  chebyshev,
  escaped,
  move,
  shortestPath,
  step,
  type Cell,
  type Dir,
} from './movement';

const open = (): boolean => false;

function at(x: number, y: number): Cell {
  return { x, y };
}

function walk(partial: {
  from?: Cell;
  dir?: Dir;
  inCombat?: boolean;
  od?: number;
  reaction?: number;
  running?: boolean;
  overloaded?: boolean;
  legsDestroyed?: 0 | 1 | 2;
  downed?: boolean;
  blocked?: (cell: Cell) => boolean;
}) {
  return move({
    from: partial.from ?? at(0, 0),
    dir: partial.dir ?? 'n',
    inCombat: partial.inCombat ?? true,
    od: partial.od ?? 10,
    reaction: partial.reaction ?? 10,
    running: partial.running ?? false,
    overloaded: partial.overloaded ?? false,
    legsDestroyed: partial.legsDestroyed ?? 0,
    downed: partial.downed ?? false,
    blocked: partial.blocked ?? open,
  });
}

test('north decreases y: reaction 10 steps one cell and spends 1 OD in combat', () => {
  expect(step(at(0, 0), 'n')).toEqual(at(0, -1));
  expect(walk({ reaction: 10, dir: 'n', od: 5 })).toEqual(
    ok({ cell: at(0, -1), od: 4, cells: 1 }),
  );
});

test('facing deltas: +x east, +y south, diagonals are one Chebyshev cell', () => {
  expect(DIRS).toEqual(['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw']);
  expect(step(at(0, 0), 'n')).toEqual(at(0, -1));
  expect(step(at(0, 0), 'ne')).toEqual(at(1, -1));
  expect(step(at(0, 0), 'e')).toEqual(at(1, 0));
  expect(step(at(0, 0), 'se')).toEqual(at(1, 1));
  expect(step(at(0, 0), 's')).toEqual(at(0, 1));
  expect(step(at(0, 0), 'sw')).toEqual(at(-1, 1));
  expect(step(at(0, 0), 'w')).toEqual(at(-1, 0));
  expect(step(at(0, 0), 'nw')).toEqual(at(-1, -1));
  expect(chebyshev(at(0, 0), at(1, -1))).toBe(1);
  expect(chebyshev(at(2, 5), at(-1, 1))).toBe(4);
  expect(chebyshev(at(3, 3), at(3, 3))).toBe(0);
});

test('reaction 15 steps two cells for 1 OD', () => {
  expect(walk({ reaction: 15, dir: 'n', od: 4 })).toEqual(
    ok({ cell: at(0, -2), od: 3, cells: 2 }),
  );
});

test('reaction 25 run covers 8 cells and spends runOdCost', () => {
  const derived = derive({
    stats: { ...emptyPoints(), reaction: 25 },
    level: 1,
    totalWeightKg: 0,
  });
  expect(derived.cellsPerRun).toBe(8);
  expect(derived.runOdCost).toBe(3);
  expect(walk({ reaction: 25, running: true, dir: 'e', od: 5 })).toEqual(
    ok({ cell: at(8, 0), od: 2, cells: 8 }),
  );
});

test('cellsFor uses derive for step and run distances', () => {
  for (const reaction of [10, 14, 15, 24, 25]) {
    const derived = derive({
      stats: { ...emptyPoints(), reaction },
      level: 1,
      totalWeightKg: 0,
    });
    const common = {
      reaction,
      overloaded: false,
      legsDestroyed: 0 as const,
      downed: false,
    };
    expect(cellsFor({ ...common, running: false })).toBe(derived.cellsPerStep);
    expect(cellsFor({ ...common, running: true })).toBe(derived.cellsPerRun);
  }
});

test('outside combat a step does not change OD, including when OD is 0', () => {
  expect(walk({ inCombat: false, od: 0, reaction: 10 })).toEqual(
    ok({ cell: at(0, -1), od: 0, cells: 1 }),
  );
  expect(walk({ inCombat: false, od: 2, reaction: 25, running: true, dir: 's' })).toEqual(
    ok({ cell: at(0, 8), od: 2, cells: 8 }),
  );
});

test('overload run is rejected and leaves OD and position untouched', () => {
  const from = at(4, 4);
  const result = walk({
    from,
    running: true,
    overloaded: true,
    od: 9,
    inCombat: false,
  });
  expect(result).toEqual(err('overload_run'));
  expect(from).toEqual(at(4, 4));
});

test('overload does not block a walk', () => {
  expect(walk({ overloaded: true, running: false, reaction: 10, od: 3 })).toEqual(
    ok({ cell: at(0, -1), od: 2, cells: 1 }),
  );
});

test('two destroyed legs reject a step with legs', () => {
  expect(walk({ legsDestroyed: 2, od: 5 })).toEqual(err('legs'));
  expect(walk({ legsDestroyed: 2, running: true, reaction: 25, od: 5 })).toEqual(err('legs'));
  expect(cellsFor({
    reaction: 25,
    running: true,
    overloaded: false,
    legsDestroyed: 2,
    downed: false,
  })).toBe(0);
});

test('one destroyed leg halves distance and keeps at least 1', () => {
  expect(
    cellsFor({
      reaction: 10,
      running: false,
      overloaded: false,
      legsDestroyed: 1,
      downed: false,
    }),
  ).toBe(1);
  expect(walk({ reaction: 10, legsDestroyed: 1, od: 3 })).toEqual(
    ok({ cell: at(0, -1), od: 2, cells: 1 }),
  );

  expect(
    cellsFor({
      reaction: 15,
      running: false,
      overloaded: false,
      legsDestroyed: 1,
      downed: false,
    }),
  ).toBe(1);
  expect(walk({ reaction: 15, legsDestroyed: 1, dir: 'e', od: 3 })).toEqual(
    ok({ cell: at(1, 0), od: 2, cells: 1 }),
  );
});

test('a wall on the second cell of a long step stops on the first and still spends OD', () => {
  const blocked = (cell: Cell): boolean => cell.x === 0 && cell.y === -2;
  expect(walk({ reaction: 15, dir: 'n', od: 6, blocked })).toEqual(
    ok({ cell: at(0, -1), od: 5, cells: 1 }),
  );
});

test('a run that hits a wall midway still spends the full run cost', () => {
  const blocked = (cell: Cell): boolean => cell.y <= -4;
  expect(walk({ reaction: 25, running: true, dir: 'n', od: 7, blocked })).toEqual(
    ok({ cell: at(0, -3), od: 4, cells: 3 }),
  );
});

test('the first cell blocked spends nothing', () => {
  const blocked = (cell: Cell): boolean => cell.y === -1;
  expect(walk({ reaction: 15, dir: 'n', od: 6, blocked })).toEqual(err('blocked'));
});

test('not enough OD rejects the move', () => {
  expect(walk({ inCombat: true, od: 0, reaction: 10 })).toEqual(err('od'));
  expect(walk({ inCombat: true, od: 2, running: true, reaction: 25 })).toEqual(err('od'));
  expect(walk({ inCombat: true, od: 3, running: true, reaction: 10, dir: 'w' })).toEqual(
    ok({ cell: at(-4, 0), od: 0, cells: 4 }),
  );
});

test('downed crawls one cell, cannot run, and the crawl gap is 3 seconds', () => {
  expect(DOWNED_CRAWL_MS).toBe(3000);
  expect(SIM_TICK_MS).toBe(100);
  expect(DOWNED_CRAWL_MS / SIM_TICK_MS).toBe(30);
  expect(
    cellsFor({
      reaction: 25,
      running: false,
      overloaded: false,
      legsDestroyed: 0,
      downed: true,
    }),
  ).toBe(1);
  expect(walk({ downed: true, reaction: 25, od: 4, dir: 'e' })).toEqual(
    ok({ cell: at(1, 0), od: 3, cells: 1 }),
  );
  expect(walk({ downed: true, running: true, reaction: 25, od: 9 })).toEqual(err('downed'));
  expect(walk({ downed: true, inCombat: false, od: 0 })).toEqual(
    ok({ cell: at(0, -1), od: 0, cells: 1 }),
  );
});

test('running while overloaded is rejected before downed or destroyed legs', () => {
  expect(
    walk({
      running: true,
      overloaded: true,
      downed: true,
      legsDestroyed: 2,
      od: 9,
    }),
  ).toEqual(err('overload_run'));
});

test('destroyed legs still block a downed crawl', () => {
  expect(walk({ downed: true, legsDestroyed: 2, running: false, od: 5 })).toEqual(err('legs'));
});

test('shortest path walks around a wall and prefers DIRS order on ties', () => {
  const straight = shortestPath(at(0, 0), at(0, -2), open, 8);
  expect(straight).toEqual([at(0, 0), at(0, -1), at(0, -2)]);

  const blockedEast = (cell: Cell): boolean => cell.x === 1 && cell.y === 0;
  const around = shortestPath(at(0, 0), at(2, 0), blockedEast, 8);
  expect(around).toEqual([at(0, 0), at(1, -1), at(2, 0)]);

  const again = shortestPath(at(0, 0), at(2, 0), blockedEast, 8);
  expect(again).toEqual(around);
});

test('a diagonal is allowed when both orthogonal corners are blocked', () => {
  const corners = (cell: Cell): boolean =>
    (cell.x === 1 && cell.y === 0) || (cell.x === 0 && cell.y === -1);
  expect(shortestPath(at(0, 0), at(1, -1), corners, 4)).toEqual([at(0, 0), at(1, -1)]);
});

test('shortest path limit counts nodes including start and goal', () => {
  expect(shortestPath(at(0, 0), at(0, 0), open, 1)).toEqual([at(0, 0)]);
  expect(shortestPath(at(0, 0), at(0, -2), open, 3)).toEqual([at(0, 0), at(0, -1), at(0, -2)]);
  expect(shortestPath(at(0, 0), at(0, -2), open, 2)).toBeNull();
  expect(shortestPath(at(0, 0), at(0, -1), open, 0)).toBeNull();
  expect(shortestPath(at(0, 0), at(1, 0), (cell) => cell.x === 1 && cell.y === 0, 8)).toBeNull();
});

test('escape needs every enemy at least 10 away and self strictly outside 15', () => {
  expect(
    escaped({
      origin: at(0, 0),
      position: at(16, 0),
      enemies: [at(16, 10)],
    }),
  ).toBe(true);
  expect(
    escaped({
      origin: at(0, 0),
      position: at(16, 0),
      enemies: [at(16, 9)],
    }),
  ).toBe(false);
  expect(
    escaped({
      origin: at(0, 0),
      position: at(15, 0),
      enemies: [at(15, 10)],
    }),
  ).toBe(false);
  expect(
    escaped({
      origin: at(0, 0),
      position: at(16, 0),
      enemies: [at(16, 10), at(7, 0)],
    }),
  ).toBe(false);
});
