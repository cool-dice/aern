import { err, ok, type Result } from './result';
import type { Rng } from './rng';
import { damageMultiplier } from './stats';

export const UNARMED_DAMAGE = 2;

const AIM_OD_SURCHARGE = 1;
const AIM_ACCURACY_PENALTY = 2;
const MAX_RANGE_ACCURACY_PENALTY = 2;
const COVER_EVASION_BONUS = 2;
const DODGE_OD_COST = 1;
const HEAD_BREAK_STUN_MS = 3000;

const LIMB_FRACTION = {
  head: 0.3,
  torso: 1,
  arm_left: 0.2,
  arm_right: 0.2,
  leg_left: 0.25,
  leg_right: 0.25,
} as const;

export type LimbId = keyof typeof LIMB_FRACTION;

export interface Combatant {
  id: string;
  reaction: number;
  accuracyStat: number;
  accuracyScore: number;
  evasion: number;
  armor: number;
  od: number;
  hp: number;
  maxHp: number;
  limbs: Record<LimbId, number>;
  alive: boolean;
  downed: boolean;
  cover: boolean;
  stunned: boolean;
}

export interface AttackInput {
  attacker: Combatant;
  target: Combatant;
  weaponDamage: number;
  odCost: number;
  range: number;
  distance: number;
  los: boolean;
  aim: LimbId | null;
  melee: boolean;
  friendlyFire: boolean;
  sameGroup: boolean;
  pvpOpen: boolean;
  safeZone: boolean;
  issuedAtMs: number;
}

export type AttackError =
  | 'no_od'
  | 'range'
  | 'los'
  | 'friendly'
  | 'safe'
  | 'dead'
  | 'downed_attacker'
  | 'stun_blocked';

export interface AttackResult {
  attacker: Combatant;
  target: Combatant;
  hit: boolean;
  damage: number;
  limb: LimbId;
  stunnedMs: number;
  reason: 'hit' | 'dodged';
}

export function limbMax(maxHp: number, limb: LimbId): number {
  return Math.floor(maxHp * LIMB_FRACTION[limb]);
}

export function resolveAttack(input: AttackInput): Result<AttackResult, AttackError> {
  const failure = refusal(input);
  if (failure !== null) {
    return err(failure);
  }

  const attacker = copyCombatant(input.attacker);
  const target = copyCombatant(input.target);
  attacker.od -= attackOdCost(input);

  const limb = input.aim ?? 'torso';
  const accuracy = attacker.accuracyScore - accuracyPenalty(input);
  const evasion = target.evasion + (target.cover ? COVER_EVASION_BONUS : 0);

  if (target.od >= DODGE_OD_COST && evasion >= accuracy) {
    target.od -= DODGE_OD_COST;
    return ok({
      attacker,
      target,
      hit: false,
      damage: 0,
      limb,
      stunnedMs: 0,
      reason: 'dodged',
    });
  }

  const applied = applyHit(attacker.accuracyStat, input.weaponDamage, target, limb);
  return ok({
    attacker,
    target,
    hit: true,
    damage: applied.torsoDamage,
    limb,
    stunnedMs: applied.stunnedMs,
    reason: 'hit',
  });
}

export function orderByInitiative<T extends { reaction: number; issuedAtMs: number }>(
  actions: T[],
  rng: Rng,
): T[] {
  const decorated = actions.map((action, index) => ({ action, index }));
  decorated.sort((left, right) => {
    if (left.action.issuedAtMs !== right.action.issuedAtMs) {
      return left.action.issuedAtMs - right.action.issuedAtMs;
    }
    if (left.action.reaction !== right.action.reaction) {
      return right.action.reaction - left.action.reaction;
    }
    return left.index - right.index;
  });

  const ordered: T[] = [];
  let cursor = 0;
  while (cursor < decorated.length) {
    const start = decorated[cursor];
    if (start === undefined) {
      break;
    }
    let end = cursor + 1;
    while (end < decorated.length) {
      const next = decorated[end];
      if (
        next === undefined ||
        next.action.issuedAtMs !== start.action.issuedAtMs ||
        next.action.reaction !== start.action.reaction
      ) {
        break;
      }
      end += 1;
    }
    const group = decorated.slice(cursor, end);
    if (group.length > 1 && rng.nextInt(2) !== 0) {
      group.reverse();
    }
    for (const entry of group) {
      ordered.push(entry.action);
    }
    cursor = end;
  }
  return ordered;
}

function refusal(input: AttackInput): AttackError | null {
  if (!input.target.alive) {
    return 'dead';
  }
  if (input.safeZone && !input.pvpOpen) {
    return 'safe';
  }
  if (input.sameGroup && !input.friendlyFire) {
    return 'friendly';
  }
  if (!input.melee && !input.los) {
    return 'los';
  }
  if (outOfRange(input)) {
    return 'range';
  }
  if (input.attacker.stunned) {
    return 'stun_blocked';
  }
  if (input.attacker.downed) {
    return 'downed_attacker';
  }
  if (input.attacker.od < attackOdCost(input)) {
    return 'no_od';
  }
  return null;
}

function outOfRange(input: AttackInput): boolean {
  if (input.melee) {
    return input.distance !== 1;
  }
  return input.distance > input.range;
}

function attackOdCost(input: AttackInput): number {
  return input.odCost + (input.aim !== null ? AIM_OD_SURCHARGE : 0);
}

function accuracyPenalty(input: AttackInput): number {
  const aim = input.aim !== null ? AIM_ACCURACY_PENALTY : 0;
  const atMaxRange =
    !input.melee && input.distance === input.range ? MAX_RANGE_ACCURACY_PENALTY : 0;
  return aim + atMaxRange;
}

function applyHit(
  accuracyStat: number,
  weaponDamage: number,
  target: Combatant,
  limb: LimbId,
): { torsoDamage: number; stunnedMs: number } {
  const baseDamage = Math.max(
    1,
    Math.floor(weaponDamage * damageMultiplier(accuracyStat) - target.armor),
  );
  let torsoDamage = baseDamage;
  let stunnedMs = 0;

  if (limb !== 'torso') {
    const before = limbPool(target.limbs, limb);
    const after = before - baseDamage;
    if (limb === 'head' && before > 0 && after <= 0) {
      torsoDamage = Math.max(1, baseDamage * 2);
      stunnedMs = HEAD_BREAK_STUN_MS;
    }
    target.limbs[limb] = after > 0 ? after : 0;
  }

  target.hp -= torsoDamage;
  return { torsoDamage, stunnedMs };
}

function limbPool(limbs: Record<LimbId, number>, limb: LimbId): number {
  switch (limb) {
    case 'head':
      return limbs.head;
    case 'torso':
      return limbs.torso;
    case 'arm_left':
      return limbs.arm_left;
    case 'arm_right':
      return limbs.arm_right;
    case 'leg_left':
      return limbs.leg_left;
    case 'leg_right':
      return limbs.leg_right;
  }
}

function copyCombatant(combatant: Combatant): Combatant {
  return {
    ...combatant,
    limbs: { ...combatant.limbs },
  };
}
