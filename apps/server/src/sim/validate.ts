import {
  limbMax,
  resolveAttack,
  type AttackError,
  type AttackInput,
  type Combatant,
  type LimbId,
} from '@rift/domain/combat';
import { chebyshev, move, type Cell } from '@rift/domain/movement';
import { derive, emptyPoints } from '@rift/domain/stats';
import type { ClientCommand } from '@rift/protocol';

/**
 * Gameplay rejects. Gateway codes (`stale`, `rate_limited`, signature) stay in task 043.
 * A command issued more than 2s ahead of the server is not rejected here.
 */
export const VALIDATE_CODES = [
  'no_od',
  'range',
  'los',
  'cooldown',
  'resources',
  'target',
  'safe',
  'status',
  'weight',
  'nn',
  'duplicate',
  'unknown_action',
] as const;

export type ValidateCode = (typeof VALIDATE_CODES)[number];

export interface ValidateInput {
  action: string;
  commandId: string;
  seen: Set<string>;
  od: number;
  odCost: number;
  distance: number;
  range: number;
  los: boolean;
  cooldownReady: boolean;
  hasResource: boolean;
  targetAlive: boolean;
  safeZone: boolean;
  pvpOpen: boolean;
  stunned: boolean;
  downed: boolean;
  running: boolean;
  overloaded: boolean;
  neuroshock: boolean;
  recentRejects: number;
}

/**
 * Success matches `Result<{ cheatStrike: boolean }, string>`.
 * Failures also carry `cheatStrike` because the fifth reject in 60s is reported with the error.
 */
export type CommandDecision =
  | { ok: true; value: { cheatStrike: boolean } }
  | { ok: false; code: ValidateCode; cheatStrike: boolean };

/**
 * The 64 catalog ids. Movement is `step_*` / `run_*` only — there is no `move` alias.
 * Order matches the action list: index 0 `step_n`, index 16 `wait`, last `scan`.
 */
export const COMMAND_ACTIONS: readonly string[] = [
  'step_n',
  'step_ne',
  'step_e',
  'step_se',
  'step_s',
  'step_sw',
  'step_w',
  'step_nw',
  'run_n',
  'run_ne',
  'run_e',
  'run_se',
  'run_s',
  'run_sw',
  'run_w',
  'run_nw',
  'wait',
  'attack_melee',
  'attack_ranged',
  'aim',
  'ability_1',
  'ability_2',
  'ability_3',
  'dodge',
  'take',
  'drop',
  'use',
  'open',
  'hack',
  'talk',
  'swap_weapon',
  'swap_armor',
  'use_item',
  'discard',
  'station',
  'recipe',
  'craft_start',
  'craft_boost',
  'auction_open',
  'auction_list',
  'auction_buy',
  'auction_sell',
  'trade',
  'quest_accept',
  'quest_abandon',
  'quest_turnin',
  'guild_join',
  'guild_leave',
  'guild_create',
  'guild_invite',
  'guild_vote',
  'guild_war',
  'chat',
  'mail',
  'title',
  'bind',
  'portal',
  'rest',
  'sleep',
  'reload',
  'crawl',
  'party_invite',
  'loot_corpse',
  'scan',
];

const ACTION_SET = new Set<string>(COMMAND_ACTIONS);

/** Attack lag window. Older snapshots fall back to the current distance and are not `stale`. */
export const LAG_COMPENSATION_MS = 500;

export interface LagSample {
  atMs: number;
  attacker: Cell;
  target: Cell;
}

export function seenCommand(seen: ReadonlySet<string>, id: string): boolean {
  return seen.has(id);
}

export function rememberCommand(seen: ReadonlySet<string>, id: string): Set<string> {
  const next = new Set(seen);
  next.add(id);
  return next;
}

export function validateCommand(input: ValidateInput): CommandDecision {
  if (seenCommand(input.seen, input.commandId)) {
    return reject('duplicate', input.recentRejects);
  }
  if (!ACTION_SET.has(input.action)) {
    return reject('unknown_action', input.recentRejects);
  }
  if (failsStatus(input)) {
    return reject('status', input.recentRejects);
  }
  if (failsSafe(input)) {
    return reject('safe', input.recentRejects);
  }
  if (input.neuroshock && input.action.startsWith('ability_')) {
    return reject('nn', input.recentRejects);
  }
  if (failsWeight(input)) {
    return reject('weight', input.recentRejects);
  }
  if (!input.cooldownReady) {
    return reject('cooldown', input.recentRejects);
  }
  if (!input.hasResource) {
    return reject('resources', input.recentRejects);
  }
  if (failsTarget(input)) {
    return reject('target', input.recentRejects);
  }
  if (failsLos(input)) {
    return reject('los', input.recentRejects);
  }
  if (failsRange(input)) {
    return reject('range', input.recentRejects);
  }
  if (failsOd(input)) {
    return reject('no_od', input.recentRejects);
  }
  return { ok: true, value: { cheatStrike: false } };
}

export function validateClientCommand(
  command: ClientCommand,
  state: Omit<ValidateInput, 'action' | 'commandId'>,
): CommandDecision {
  return validateCommand({
    ...state,
    action: command.action,
    commandId: command.commandId,
  });
}

export function distanceAtIssue(input: {
  nowMs: number;
  issuedAtMs: number;
  currentAttacker: Cell;
  currentTarget: Cell;
  samples: readonly LagSample[];
}): number {
  let best: LagSample | null = null;
  for (const sample of input.samples) {
    if (sample.atMs > input.issuedAtMs) {
      continue;
    }
    const ageMs = input.nowMs - sample.atMs;
    if (ageMs > LAG_COMPENSATION_MS) {
      continue;
    }
    if (best === null || sample.atMs >= best.atMs) {
      best = sample;
    }
  }
  if (best === null) {
    return chebyshev(input.currentAttacker, input.currentTarget);
  }
  return chebyshev(best.attacker, best.target);
}

export function validateCommandAtIssue(
  input: ValidateInput,
  lag: {
    nowMs: number;
    issuedAtMs: number;
    currentAttacker: Cell;
    currentTarget: Cell;
    samples: readonly LagSample[];
  },
): CommandDecision {
  return validateCommand({
    ...input,
    distance: distanceAtIssue(lag),
  });
}

/** Combat step (`running: false`) spends 1 OD. The figure comes from `move`, not a second formula. */
export function combatStepOdCost(): number {
  const od = 5;
  const result = move({
    from: { x: 0, y: 0 },
    dir: 'n',
    inCombat: true,
    od,
    reaction: 10,
    running: false,
    overloaded: false,
    legsDestroyed: 0,
    downed: false,
    blocked: () => false,
  });
  if (!result.ok) {
    throw new Error(`combat step probe failed: ${result.code}`);
  }
  return od - result.value.od;
}

/** Run spends `runOdCost` from derived stats (3). */
export function combatRunOdCost(reaction: number): 3 {
  return derive({
    stats: { ...emptyPoints(), reaction },
    level: 1,
    totalWeightKg: 0,
  }).runOdCost;
}

function reject(code: ValidateCode, recentRejects: number): CommandDecision {
  return {
    ok: false,
    code,
    cheatStrike: recentRejects >= 4,
  };
}

function isAttack(action: string): boolean {
  return action === 'attack_melee' || action === 'attack_ranged' || action === 'aim';
}

function isMelee(action: string): boolean {
  return action === 'attack_melee';
}

function isRunning(input: ValidateInput): boolean {
  return input.running || input.action.startsWith('run_');
}

function failsStatus(input: ValidateInput): boolean {
  if (input.stunned) {
    const code = attackRefusal({ stunned: true, downed: false });
    if (code === 'stun_blocked') {
      return true;
    }
  }
  if (input.downed) {
    const code = attackRefusal({ stunned: false, downed: true });
    if (code === 'downed_attacker') {
      return true;
    }
  }
  return false;
}

function failsSafe(input: ValidateInput): boolean {
  if (!isAttack(input.action)) {
    return false;
  }
  return (
    attackRefusal({
      safeZone: input.safeZone,
      pvpOpen: input.pvpOpen,
      melee: isMelee(input.action),
    }) === 'safe'
  );
}

function failsWeight(input: ValidateInput): boolean {
  if (!isRunning(input)) {
    return false;
  }
  const result = move({
    from: { x: 0, y: 0 },
    dir: 'n',
    inCombat: false,
    od: 10,
    reaction: 10,
    running: true,
    overloaded: input.overloaded,
    legsDestroyed: 0,
    downed: false,
    blocked: () => false,
  });
  return !result.ok && result.code === 'overload_run';
}

function failsTarget(input: ValidateInput): boolean {
  return attackRefusal({ targetAlive: input.targetAlive }) === 'dead';
}

function failsLos(input: ValidateInput): boolean {
  return (
    attackRefusal({
      melee: isMelee(input.action),
      los: input.los,
      distance: 1,
      range: 10,
    }) === 'los'
  );
}

function failsRange(input: ValidateInput): boolean {
  return (
    attackRefusal({
      melee: isMelee(input.action),
      los: true,
      distance: input.distance,
      range: input.range,
      od: Math.max(input.od, input.odCost, 1),
      odCost: 1,
    }) === 'range'
  );
}

function failsOd(input: ValidateInput): boolean {
  if (input.action === 'portal') {
    return false;
  }
  return (
    attackRefusal({
      od: input.od,
      odCost: input.odCost,
      melee: false,
      los: true,
      distance: 1,
      range: 10,
      stunned: false,
      downed: false,
    }) === 'no_od'
  );
}

interface AttackProbe {
  targetAlive?: boolean;
  safeZone?: boolean;
  pvpOpen?: boolean;
  los?: boolean;
  melee?: boolean;
  distance?: number;
  range?: number;
  stunned?: boolean;
  downed?: boolean;
  od?: number;
  odCost?: number;
}

function attackRefusal(probe: AttackProbe): AttackError | null {
  const result = resolveAttack(attackInput(probe));
  if (result.ok) {
    return null;
  }
  return result.code;
}

function attackInput(probe: AttackProbe): AttackInput {
  const maxHp = 20;
  return {
    attacker: combatant({
      id: 'attacker',
      od: probe.od ?? 5,
      stunned: probe.stunned ?? false,
      downed: probe.downed ?? false,
      maxHp,
    }),
    target: combatant({
      id: 'target',
      alive: probe.targetAlive ?? true,
      od: 0,
      evasion: 0,
      maxHp,
    }),
    weaponDamage: 1,
    odCost: probe.odCost ?? 1,
    range: probe.range ?? 10,
    distance: probe.distance ?? 1,
    los: probe.los ?? true,
    aim: null,
    melee: probe.melee ?? false,
    friendlyFire: false,
    sameGroup: false,
    pvpOpen: probe.pvpOpen ?? false,
    safeZone: probe.safeZone ?? false,
    issuedAtMs: 0,
  };
}

function combatant(partial: Partial<Combatant> & Pick<Combatant, 'id'>): Combatant {
  const maxHp = partial.maxHp ?? 20;
  return {
    id: partial.id,
    reaction: partial.reaction ?? 10,
    accuracyStat: partial.accuracyStat ?? 0,
    accuracyScore: partial.accuracyScore ?? 0,
    evasion: partial.evasion ?? 0,
    armor: partial.armor ?? 0,
    od: partial.od ?? 5,
    hp: partial.hp ?? maxHp,
    maxHp,
    limbs: partial.limbs ?? filledLimbs(maxHp),
    alive: partial.alive ?? true,
    downed: partial.downed ?? false,
    cover: partial.cover ?? false,
    stunned: partial.stunned ?? false,
  };
}

function filledLimbs(maxHp: number): Record<LimbId, number> {
  return {
    head: limbMax(maxHp, 'head'),
    torso: limbMax(maxHp, 'torso'),
    arm_left: limbMax(maxHp, 'arm_left'),
    arm_right: limbMax(maxHp, 'arm_right'),
    leg_left: limbMax(maxHp, 'leg_left'),
    leg_right: limbMax(maxHp, 'leg_right'),
  };
}
