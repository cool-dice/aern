import { expect, test } from 'vitest';
import {
  beginPurify,
  breakClean,
  completePurify,
  effectMultiplier,
  equipCore,
  installEcho,
  learnPath,
  NEUROSHOCK_FACTOR,
  neuroshock,
  neuroshockScale,
  nnCostCore,
  nnCostProgram,
  nnUsed,
  progressionSlots,
  recoverForgetting,
  tickForgetting,
  unequipCore,
  type BuildError,
  type BuildState,
  type CoreRef,
  type Program,
} from './build';
import type { Result } from './result';
import { applyCap, derive, emptyPoints } from './stats';

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;

function program(overrides: Partial<Program> = {}): Program {
  return {
    templateId: 'spark',
    grade: 1,
    kind: 'echo',
    forgetting: 0,
    idleMs: 0,
    ...overrides,
  };
}

function build(overrides: Partial<BuildState> = {}): BuildState {
  return {
    clean: false,
    purifyingUntilMs: null,
    level: 12,
    will: 10,
    programs: [],
    cores: [],
    relicSocketFree: 1,
    inCityOrHub: true,
    inCombat: false,
    ...overrides,
  };
}

function kit(): CoreRef {
  return { templateId: 'first_engineer_kit', grade: 5, implant: false };
}

function expectErr<E extends string>(result: Result<unknown, E>, code: E): void {
  expect(result.ok).toBe(false);
  if (!result.ok) {
    expect(result.code).toBe(code);
  }
}

test('progression slots are floor(level / 3)', () => {
  expect(progressionSlots(1)).toBe(0);
  expect(progressionSlots(3)).toBe(1);
  expect(progressionSlots(6)).toBe(2);
  expect(progressionSlots(48)).toBe(16);
  expect(progressionSlots(50)).toBe(16);
});

test('level outside 1–50 throws RangeError from derive', () => {
  expect(() => progressionSlots(0)).toThrow(RangeError);
  expect(() => progressionSlots(51)).toThrow(RangeError);
  expect(() => neuroshock(build({ level: 0 }))).toThrow(RangeError);
  expect(() => neuroshock(build({ level: 51 }))).toThrow(RangeError);
});

test('program and core neural costs follow the grade table', () => {
  expect(nnCostProgram(1)).toBe(1);
  expect(nnCostProgram(2)).toBe(2);
  expect(nnCostProgram(3)).toBe(3);
  expect(nnCostCore(1)).toBe(0);
  expect(nnCostCore(2)).toBe(1);
  expect(nnCostCore(3)).toBe(2);
  expect(nnCostCore(4)).toBe(2);
  expect(nnCostCore(5)).toBe(3);
});

test('will 10 and three grade-3 programs stay under the derived limit', () => {
  const state = build({
    will: 10,
    level: 30,
    programs: [
      program({ templateId: 'a', grade: 3 }),
      program({ templateId: 'b', grade: 3 }),
      program({ templateId: 'c', grade: 3 }),
    ],
  });
  const limit = derive({
    stats: { ...emptyPoints(), will: 10 },
    level: 30,
    totalWeightKg: 0,
  }).nnLimit;
  expect(limit).toBe(20);
  expect(nnUsed(state)).toBe(9);
  expect(neuroshock(state)).toBe(false);
});

test('will 2 with a grade-3 program and a grade-5 core is neuroshock', () => {
  const state = build({
    will: 2,
    level: 20,
    programs: [program({ templateId: 'memory', grade: 3 })],
    cores: [{ templateId: 'heart', grade: 5, implant: true }],
  });
  expect(nnUsed(state)).toBe(6);
  const limit = derive({
    stats: { ...emptyPoints(), will: 2 },
    level: 20,
    totalWeightKg: 0,
  }).nnLimit;
  expect(limit).toBe(4);
  expect(neuroshock(state)).toBe(true);
  expect(NEUROSHOCK_FACTOR).toBe(0.5);
  expect(neuroshockScale(20, true)).toBe(10);
  expect(neuroshockScale(20, false)).toBe(20);
});

test('forgetting multipliers are 1, 0.75, 0.5, and 0', () => {
  expect(effectMultiplier(program({ forgetting: 0 }))).toBe(1);
  expect(effectMultiplier(program({ forgetting: 1 }))).toBe(0.75);
  expect(effectMultiplier(program({ forgetting: 2 }))).toBe(0.5);
  expect(effectMultiplier(program({ forgetting: 3 }))).toBe(0);
});

test('forgetting 3 still occupies neural load', () => {
  const state = build({
    will: 10,
    programs: [program({ grade: 3, forgetting: 3 })],
  });
  expect(effectMultiplier(state.programs[0]!)).toBe(0);
  expect(nnUsed(state)).toBe(3);
  expect(neuroshock(state)).toBe(false);
});

test('duplicate templateId is rejected', () => {
  const state = build({
    level: 12,
    relicSocketFree: 2,
    programs: [program({ templateId: 'spark' })],
  });
  expectErr(installEcho(state, program({ templateId: 'spark', grade: 2 })), 'duplicate');
  expect(state.programs).toHaveLength(1);
  expect(state.relicSocketFree).toBe(2);
});

test('level 1 has no progression slot', () => {
  const state = build({ level: 1, relicSocketFree: 1, programs: [] });
  expectErr(installEcho(state, program()), 'slots');
});

test('installed programs share one progression cap, separate from relic sockets', () => {
  const state = build({
    level: 3,
    relicSocketFree: 2,
    programs: [program({ kind: 'path', templateId: 'legacy', grade: 1 })],
  });
  expect(progressionSlots(3)).toBe(1);
  expectErr(installEcho(state, program({ templateId: 'fresh' })), 'slots');
});

test('a clean character cannot install an echo and a dirty one cannot learn a path', () => {
  expectErr(
    installEcho(build({ clean: true, level: 12 }), program({ kind: 'echo' })),
    'incompatible',
  );
  const dirty = build({ clean: false, level: 12 });
  expectErr(learnPath(dirty, program({ kind: 'path', grade: 1 }), 100, 0), 'incompatible');
  expect(dirty.programs).toHaveLength(0);
});

test('echo install takes one program slot and one free socket', () => {
  const source = program({ templateId: 'spark', grade: 2 });
  const state = build({ level: 6, relicSocketFree: 2, programs: [] });
  const result = installEcho(state, source);
  expect(result.ok).toBe(true);
  if (result.ok) {
    expect(result.value.programs).toHaveLength(1);
    expect(result.value.programs[0]).toEqual(source);
    expect(result.value.relicSocketFree).toBe(1);
    expect(result.value.programs).not.toBe(state.programs);
  }
  source.grade = 3;
  expect(state.programs).toHaveLength(0);
  if (result.ok) {
    expect(result.value.programs[0]?.grade).toBe(2);
  }
});

test('no free relic socket is sockets, not slots', () => {
  const state = build({ level: 12, relicSocketFree: 0, programs: [] });
  expectErr(installEcho(state, program()), 'sockets');
});

test('echo overload is equipped instead of rejected', () => {
  // Artifact 6 states the consequence of exceeding NN. Code `nn` stays in the union and is not returned.
  const reserved: BuildError = 'nn';
  expect(reserved).toBe('nn');
  const state = build({
    clean: false,
    level: 30,
    will: 1,
    relicSocketFree: 1,
    programs: [],
  });
  const result = installEcho(state, program({ templateId: 'memory', grade: 3 }));
  expect(result.ok).toBe(true);
  if (result.ok) {
    expect(result.value.programs).toHaveLength(1);
    expect(result.value.relicSocketFree).toBe(0);
    expect(nnUsed(result.value)).toBe(3);
    expect(neuroshock(result.value)).toBe(true);
  }
});

test('install and study refuse combat before zone', () => {
  const fighting = build({ inCombat: true, inCityOrHub: false, level: 12 });
  expectErr(installEcho(fighting, program()), 'combat');
  expectErr(learnPath(fighting, program({ kind: 'path' }), 100, 0), 'combat');
  const field = build({ inCombat: false, inCityOrHub: false, level: 12 });
  expectErr(installEcho(field, program()), 'zone');
  expectErr(
    learnPath(build({ clean: true, inCityOrHub: false }), program({ kind: 'path' }), 100, 0),
    'zone',
  );
});

test('grade 3 path study spends 800 and is ready after 7_200_000 ms', () => {
  const state = build({ clean: true, level: 12, relicSocketFree: 3 });
  const result = learnPath(
    state,
    program({ kind: 'path', grade: 3, templateId: 'tradition' }),
    800,
    1_000,
  );
  expect(result.ok).toBe(true);
  if (result.ok) {
    expect(result.value.gold).toBe(0);
    expect(result.value.readyAtMs).toBe(1_000 + 7_200_000);
    expect(result.value.state.programs).toHaveLength(1);
    expect(result.value.state.relicSocketFree).toBe(3);
    expect(result.value.state.programs[0]?.kind).toBe('path');
  }
});

test('grade 1 and 2 channels are 30 min / 100 and 1 h / 300', () => {
  const state = build({ clean: true, level: 30 });
  const first = learnPath(state, program({ kind: 'path', grade: 1, templateId: 'lesson' }), 100, 0);
  const second = learnPath(state, program({ kind: 'path', grade: 2, templateId: 'way' }), 300, 50);
  expect(first.ok && second.ok).toBe(true);
  if (first.ok && second.ok) {
    expect(first.value.gold).toBe(0);
    expect(first.value.readyAtMs).toBe(30 * 60_000);
    expect(second.value.gold).toBe(0);
    expect(second.value.readyAtMs).toBe(50 + 60 * 60_000);
  }
});

test('799 gold leaves the state and the purse untouched', () => {
  const state = build({ clean: true, level: 30, programs: [] });
  const programs = state.programs;
  const gold = 799;
  const result = learnPath(
    state,
    program({ kind: 'path', grade: 3, templateId: 'tradition' }),
    gold,
    5_000,
  );
  expectErr(result, 'gold');
  expect(state.programs).toBe(programs);
  expect(state.programs).toHaveLength(0);
  expect(gold).toBe(799);
  expect(state.clean).toBe(true);
});

test('two online hours of idle advances forgetting by one, and four more reach 3', () => {
  const start = program({ kind: 'path', forgetting: 0, idleMs: 0 });
  const afterTwo = tickForgetting(start, 2 * HOUR_MS, false);
  expect(afterTwo.forgetting).toBe(1);
  expect(afterTwo.idleMs).toBe(0);
  expect(start.forgetting).toBe(0);
  const afterSix = tickForgetting(afterTwo, 4 * HOUR_MS, false);
  expect(afterSix.forgetting).toBe(3);
  expect(afterSix.idleMs).toBe(0);
});

test('use clears idle and does not restore forgetting', () => {
  const idle = tickForgetting(program({ forgetting: 0, idleMs: 0 }), HOUR_MS, false);
  expect(idle.forgetting).toBe(0);
  expect(idle.idleMs).toBe(HOUR_MS);
  const used = tickForgetting({ ...idle, forgetting: 2 }, 2 * HOUR_MS, true);
  expect(used.idleMs).toBe(0);
  expect(used.forgetting).toBe(2);
  expect(idle.forgetting).toBe(0);
});

test('forgetting stays at 3', () => {
  const parked = tickForgetting(program({ forgetting: 3, idleMs: 10 }), 5 * FORGET_HOLD(), false);
  expect(parked.forgetting).toBe(3);
  expect(parked.idleMs).toBe(10 + 5 * FORGET_HOLD());
});

test('the engineer kit rejects a dirty build and a build without a grade-3 path', () => {
  const tradition = program({ kind: 'path', grade: 3, templateId: 'tradition' });
  const dirty = build({ clean: false, level: 20, programs: [tradition] });
  expectErr(equipCore(dirty, kit(), 0), 'requirements');
  const noTradition = build({
    clean: true,
    level: 20,
    programs: [program({ kind: 'path', grade: 2, templateId: 'way' })],
  });
  expectErr(equipCore(noTradition, kit(), 0), 'requirements');
  const lowLevel = build({ clean: true, level: 19, programs: [tradition] });
  expectErr(equipCore(lowLevel, kit(), 0), 'requirements');
  const implanted = build({ clean: true, level: 20, programs: [tradition] });
  expectErr(equipCore(implanted, { ...kit(), implant: true }, 0), 'requirements');
});

test('a clean level-20 character with a tradition equips the engineer kit', () => {
  const state = build({
    clean: true,
    level: 20,
    programs: [program({ kind: 'path', grade: 3, templateId: 'tradition' })],
  });
  const core = kit();
  const result = equipCore(state, core, 0);
  expect(result.ok).toBe(true);
  if (result.ok) {
    expect(result.value.cores).toEqual([core]);
    expect(result.value.clean).toBe(true);
  }
  core.grade = 1;
  if (result.ok) {
    expect(result.value.cores[0]?.grade).toBe(5);
  }
});

test('implant cores are incompatible with clean, external cores are not, and a second core is taken', () => {
  const clean = build({ clean: true, level: 12 });
  expectErr(
    equipCore(clean, { templateId: 'implant_heart', grade: 2, implant: true }, 0),
    'incompatible',
  );
  const external = equipCore(clean, { templateId: 'field_core', grade: 1, implant: false }, 0);
  expect(external.ok).toBe(true);
  if (external.ok) {
    expectErr(
      equipCore(external.value, { templateId: 'other', grade: 1, implant: false }, 0),
      'core_taken',
    );
  }
  const dirty = build({ clean: false, level: 12 });
  const implanted = equipCore(dirty, { templateId: 'implant_heart', grade: 4, implant: true }, 0);
  expect(implanted.ok).toBe(true);
});

test('unequipCore clears the core only in a city or hub and out of combat', () => {
  const worn = build({
    cores: [{ templateId: 'field_core', grade: 2, implant: false }],
  });
  expectErr(unequipCore(build({ ...worn, inCombat: true })), 'combat');
  expectErr(unequipCore(build({ ...worn, inCityOrHub: false })), 'zone');
  const removed = unequipCore(worn);
  expect(removed.ok).toBe(true);
  if (removed.ok) {
    expect(removed.value.cores).toEqual([]);
  }
  expect(worn.cores).toHaveLength(1);
});

test('breakClean keeps paths and their neural load', () => {
  const state = build({
    clean: true,
    programs: [program({ kind: 'path', grade: 3, templateId: 'tradition', forgetting: 1 })],
  });
  const broken = breakClean(state, 10);
  expect(broken.clean).toBe(false);
  expect(broken.programs).toEqual(state.programs);
  expect(broken.programs).not.toBe(state.programs);
  expect(nnUsed(broken)).toBe(3);
  expect(state.clean).toBe(true);
});

test('purify with a relic or implant core fails, and an empty body sets a 24h deadline', () => {
  const state = build({
    clean: false,
    level: 20,
    programs: [
      program({ kind: 'path', grade: 3, templateId: 'tradition', forgetting: 2, idleMs: 40 }),
    ],
  });
  expectErr(beginPurify(state, 1, 0, 1_000), 'still_impure');
  expectErr(beginPurify(state, 0, 1, 1_000), 'still_impure');
  expect(state.purifyingUntilMs).toBeNull();
  const started = beginPurify(state, 0, 0, 1_000);
  expect(started.ok).toBe(true);
  if (!started.ok) {
    return;
  }
  expect(started.value.clean).toBe(false);
  expect(started.value.purifyingUntilMs).toBe(1_000 + DAY_MS);
  expect(applyCap(25, started.value.clean, 0)).toBe(20);
  expectErr(beginPurify(started.value, 0, 0, 2_000), 'busy');

  const early = completePurify(started.value, 1_000 + DAY_MS - 1);
  expect(early.clean).toBe(false);
  expect(early.purifyingUntilMs).toBe(1_000 + DAY_MS);
  expect(early.programs[0]?.forgetting).toBe(2);
  expect(applyCap(25, early.clean, 0)).toBe(20);

  const done = completePurify(started.value, 1_000 + DAY_MS);
  expect(done.clean).toBe(true);
  expect(done.purifyingUntilMs).toBeNull();
  expect(done.programs[0]?.forgetting).toBe(0);
  expect(done.programs[0]?.idleMs).toBe(0);
  expect(applyCap(25, done.clean, 0)).toBe(25);
  expect(started.value.programs[0]?.forgetting).toBe(2);
});

test('completePurify resets path forgetting only', () => {
  const state = build({
    purifyingUntilMs: 500,
    programs: [
      program({ kind: 'path', templateId: 'tradition', forgetting: 3, idleMs: 9 }),
      program({ kind: 'echo', templateId: 'spark', forgetting: 2, idleMs: 4 }),
    ],
  });
  const done = completePurify(state, 500);
  expect(done.programs[0]).toEqual({
    templateId: 'tradition',
    grade: 1,
    kind: 'path',
    forgetting: 0,
    idleMs: 0,
  });
  expect(done.programs[1]).toEqual({
    templateId: 'spark',
    grade: 1,
    kind: 'echo',
    forgetting: 2,
    idleMs: 4,
  });
});

test('recovering one forgetting step costs 50 gold and 30 minutes', () => {
  const state = build({
    programs: [program({ kind: 'path', templateId: 'tradition', forgetting: 3, idleMs: 80 })],
  });
  const short = recoverForgetting(state, 'tradition', 49, 0);
  expectErr(short, 'gold');
  expect(state.programs[0]?.forgetting).toBe(3);
  const result = recoverForgetting(state, 'tradition', 50, 10);
  expect(result.ok).toBe(true);
  if (result.ok) {
    expect(result.value.gold).toBe(0);
    expect(result.value.readyAtMs).toBe(10 + 30 * 60_000);
    expect(result.value.state.programs[0]?.forgetting).toBe(2);
    expect(result.value.state.programs[0]?.idleMs).toBe(80);
  }
  expectErr(
    recoverForgetting(build({ inCityOrHub: false, programs: state.programs }), 'tradition', 50, 0),
    'zone',
  );
});

function FORGET_HOLD(): number {
  return 2 * HOUR_MS;
}
