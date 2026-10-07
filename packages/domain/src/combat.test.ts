import { expect, test } from 'vitest';
import {
  UNARMED_DAMAGE,
  limbMax,
  orderByInitiative,
  resolveAttack,
  type AttackInput,
  type Combatant,
  type LimbId,
} from './combat';
import { mulberry32 } from './rng';
import { damageMultiplier, derive, emptyPoints } from './stats';

function limbsAt(
  maxHp: number,
  overrides: Partial<Record<LimbId, number>> = {},
): Record<LimbId, number> {
  return {
    head: limbMax(maxHp, 'head'),
    torso: limbMax(maxHp, 'torso'),
    arm_left: limbMax(maxHp, 'arm_left'),
    arm_right: limbMax(maxHp, 'arm_right'),
    leg_left: limbMax(maxHp, 'leg_left'),
    leg_right: limbMax(maxHp, 'leg_right'),
    ...overrides,
  };
}

function combatant(partial: Partial<Combatant> & Pick<Combatant, 'id'>): Combatant {
  const maxHp = partial.maxHp ?? 100;
  return {
    id: partial.id,
    reaction: partial.reaction ?? 10,
    accuracyStat: partial.accuracyStat ?? 10,
    accuracyScore: partial.accuracyScore ?? 10,
    evasion: partial.evasion ?? 0,
    armor: partial.armor ?? 0,
    od: partial.od ?? 5,
    hp: partial.hp ?? maxHp,
    maxHp,
    limbs: partial.limbs ?? limbsAt(maxHp),
    alive: partial.alive ?? true,
    downed: partial.downed ?? false,
    cover: partial.cover ?? false,
    stunned: partial.stunned ?? false,
  };
}

function attack(
  partial: Partial<AttackInput> & Pick<AttackInput, 'attacker' | 'target'>,
): AttackInput {
  return {
    attacker: partial.attacker,
    target: partial.target,
    weaponDamage: partial.weaponDamage ?? 10,
    odCost: partial.odCost ?? 1,
    range: partial.range ?? 10,
    distance: partial.distance ?? 5,
    los: partial.los ?? true,
    aim: partial.aim ?? null,
    melee: partial.melee ?? false,
    friendlyFire: partial.friendlyFire ?? false,
    sameGroup: partial.sameGroup ?? false,
    pvpOpen: partial.pvpOpen ?? false,
    safeZone: partial.safeZone ?? false,
    issuedAtMs: partial.issuedAtMs ?? 0,
  };
}

test('unarmed damage is the fists constant', () => {
  expect(UNARMED_DAMAGE).toBe(2);
});

test('weapon 10, accuracy stat 10, armor 5 deals 10 and spends only attacker OD', () => {
  const derived = derive({
    stats: { ...emptyPoints(), accuracy: 10, perception: 0 },
    level: 1,
    totalWeightKg: 0,
  });
  expect(derived.accuracyScore).toBe(10);
  expect(damageMultiplier(10)).toBe(1.5);

  const attacker = combatant({
    id: 'a',
    accuracyStat: 10,
    accuracyScore: derived.accuracyScore,
    od: 4,
  });
  const target = combatant({ id: 'b', evasion: 8, armor: 5, od: 3, hp: 80 });
  const input = attack({ attacker, target, weaponDamage: 10 });
  const result = resolveAttack(input);

  expect(result.ok).toBe(true);
  if (!result.ok) {
    return;
  }
  expect(result.value.hit).toBe(true);
  expect(result.value.reason).toBe('hit');
  expect(result.value.damage).toBe(10);
  expect(result.value.limb).toBe('torso');
  expect(result.value.stunnedMs).toBe(0);
  expect(result.value.attacker.od).toBe(3);
  expect(result.value.target.od).toBe(3);
  expect(result.value.target.hp).toBe(70);
  expect(result.value.attacker).not.toBe(attacker);
  expect(result.value.target).not.toBe(target);
  expect(result.value.target.limbs).not.toBe(target.limbs);
  expect(attacker.od).toBe(4);
  expect(target.od).toBe(3);
  expect(target.hp).toBe(80);
});

test('equal accuracy and evasion spends 1 target OD and deals no damage', () => {
  const attacker = combatant({ id: 'a', accuracyScore: 10, od: 3 });
  const target = combatant({ id: 'b', evasion: 10, od: 2, hp: 40 });
  const result = resolveAttack(attack({ attacker, target }));

  expect(result.ok).toBe(true);
  if (!result.ok) {
    return;
  }
  expect(result.value.hit).toBe(false);
  expect(result.value.reason).toBe('dodged');
  expect(result.value.damage).toBe(0);
  expect(result.value.stunnedMs).toBe(0);
  expect(result.value.attacker.od).toBe(2);
  expect(result.value.target.od).toBe(1);
  expect(result.value.target.hp).toBe(40);
  expect(target.hp).toBe(40);
  expect(target.od).toBe(2);
});

test('evasion does not apply when the target has 0 OD', () => {
  const attacker = combatant({ id: 'a', accuracyScore: 10, accuracyStat: 10, od: 2 });
  const target = combatant({ id: 'b', evasion: 10, od: 0, armor: 5, hp: 40 });
  const result = resolveAttack(attack({ attacker, target, weaponDamage: 10 }));

  expect(result.ok).toBe(true);
  if (!result.ok) {
    return;
  }
  expect(result.value.hit).toBe(true);
  expect(result.value.reason).toBe('hit');
  expect(result.value.damage).toBe(10);
  expect(result.value.target.od).toBe(0);
  expect(result.value.target.hp).toBe(30);
  expect(result.value.attacker.od).toBe(1);
});

test('distance past range is an error and does not spend OD', () => {
  const attacker = combatant({ id: 'a', od: 4 });
  const target = combatant({ id: 'b', hp: 40 });
  const result = resolveAttack(attack({ attacker, target, range: 10, distance: 11 }));

  expect(result).toEqual({ ok: false, code: 'range' });
  expect(attacker.od).toBe(4);
  expect(target.hp).toBe(40);
});

test('distance equal to range applies -2 accuracy and can turn a hit into a dodge', () => {
  const attacker = combatant({ id: 'a', accuracyScore: 10, od: 3 });
  const target = combatant({ id: 'b', evasion: 9, armor: 5, od: 2, hp: 50 });
  const atMax = resolveAttack(attack({ attacker, target, range: 10, distance: 10 }));
  const closer = resolveAttack(attack({ attacker, target, range: 10, distance: 9 }));

  expect(atMax.ok).toBe(true);
  if (!atMax.ok) {
    return;
  }
  expect(atMax.value.reason).toBe('dodged');
  expect(atMax.value.hit).toBe(false);
  expect(atMax.value.damage).toBe(0);
  expect(atMax.value.target.od).toBe(1);
  expect(atMax.value.target.hp).toBe(50);
  expect(atMax.value.attacker.od).toBe(2);

  expect(closer.ok).toBe(true);
  if (!closer.ok) {
    return;
  }
  expect(closer.value.reason).toBe('hit');
  expect(closer.value.target.hp).toBe(40);
});

test('melee at distance 1 uses the same to-hit check and skips the max-range penalty', () => {
  const attacker = combatant({ id: 'a', accuracyScore: 10, od: 4 });
  const dodging = combatant({ id: 'b', evasion: 10, od: 2, hp: 40 });
  const dodged = resolveAttack(
    attack({
      attacker,
      target: dodging,
      melee: true,
      distance: 1,
      range: 1,
      weaponDamage: UNARMED_DAMAGE,
    }),
  );
  expect(dodged.ok).toBe(true);
  if (!dodged.ok) {
    return;
  }
  expect(dodged.value.reason).toBe('dodged');
  expect(dodged.value.target.od).toBe(1);

  const grazed = combatant({ id: 'c', evasion: 9, od: 2, hp: 40 });
  const hit = resolveAttack(
    attack({
      attacker,
      target: grazed,
      melee: true,
      distance: 1,
      range: 1,
      weaponDamage: UNARMED_DAMAGE,
      los: false,
    }),
  );
  expect(hit.ok).toBe(true);
  if (!hit.ok) {
    return;
  }
  expect(hit.value.reason).toBe('hit');
  expect(hit.value.damage).toBe(Math.max(1, Math.floor(UNARMED_DAMAGE * damageMultiplier(10) - 0)));

  const tooFar = resolveAttack(attack({ attacker, target: grazed, melee: true, distance: 2 }));
  expect(tooFar).toEqual({ ok: false, code: 'range' });
  expect(attacker.od).toBe(4);
});

test('cover adds 2 evasion and can turn a hit into a dodge', () => {
  const attacker = combatant({ id: 'a', accuracyScore: 10, od: 3 });
  const target = combatant({ id: 'b', evasion: 8, cover: true, od: 2, hp: 40 });
  const result = resolveAttack(attack({ attacker, target }));

  expect(result.ok).toBe(true);
  if (!result.ok) {
    return;
  }
  expect(result.value.reason).toBe('dodged');
  expect(result.value.target.od).toBe(1);
  expect(result.value.target.hp).toBe(40);
  expect(result.value.target.evasion).toBe(8);
});

test('a safe zone rejects every attack unless pvpOpen', () => {
  const attacker = combatant({ id: 'a', od: 4 });
  const target = combatant({ id: 'b', hp: 40 });
  const blocked = resolveAttack(attack({ attacker, target, safeZone: true, pvpOpen: false }));
  expect(blocked).toEqual({ ok: false, code: 'safe' });
  expect(attacker.od).toBe(4);
  expect(target.hp).toBe(40);

  const open = resolveAttack(
    attack({ attacker, target, safeZone: true, pvpOpen: true, weaponDamage: 10 }),
  );
  expect(open.ok).toBe(true);
  if (open.ok) {
    expect(open.value.reason).toBe('hit');
  }
});

test('allies are protected unless the group friendly-fire flag is on', () => {
  const attacker = combatant({ id: 'a', od: 4 });
  const target = combatant({ id: 'b', hp: 40 });
  const blocked = resolveAttack(attack({ attacker, target, sameGroup: true, friendlyFire: false }));
  expect(blocked).toEqual({ ok: false, code: 'friendly' });
  expect(attacker.od).toBe(4);
  expect(target.hp).toBe(40);

  const allowed = resolveAttack(
    attack({
      attacker,
      target: combatant({ id: 'b', hp: 40, armor: 5 }),
      sameGroup: true,
      friendlyFire: true,
      weaponDamage: 10,
    }),
  );
  expect(allowed.ok).toBe(true);
  if (allowed.ok) {
    expect(allowed.value.hit).toBe(true);
    expect(allowed.value.target.hp).toBe(30);
  }
});

test('a head break doubles torso damage and stuns for 3000 ms', () => {
  expect(limbMax(100, 'head')).toBe(30);
  const attacker = combatant({ id: 'a', accuracyStat: 0, accuracyScore: 10, od: 5 });
  const target = combatant({
    id: 'b',
    evasion: 0,
    armor: 0,
    od: 4,
    hp: 100,
    maxHp: 100,
    limbs: limbsAt(100),
  });
  const result = resolveAttack(
    attack({ attacker, target, weaponDamage: 30, aim: 'head', odCost: 1 }),
  );

  expect(result.ok).toBe(true);
  if (!result.ok) {
    return;
  }
  expect(result.value.hit).toBe(true);
  expect(result.value.limb).toBe('head');
  expect(result.value.damage).toBe(60);
  expect(result.value.stunnedMs).toBe(3000);
  expect(result.value.target.hp).toBe(40);
  expect(result.value.target.limbs.head).toBe(0);
  expect(result.value.target.od).toBe(4);
  expect(result.value.attacker.od).toBe(3);
  expect(target.limbs.head).toBe(30);
  expect(target.hp).toBe(100);
});

test('a head hit that does not empty the head deals base damage once', () => {
  const attacker = combatant({ id: 'a', accuracyStat: 0, accuracyScore: 10 });
  const target = combatant({
    id: 'b',
    evasion: 0,
    hp: 100,
    limbs: limbsAt(100, { head: 30 }),
  });
  const result = resolveAttack(attack({ attacker, target, weaponDamage: 10, aim: 'head' }));

  expect(result.ok).toBe(true);
  if (!result.ok) {
    return;
  }
  expect(result.value.damage).toBe(10);
  expect(result.value.stunnedMs).toBe(0);
  expect(result.value.target.hp).toBe(90);
  expect(result.value.target.limbs.head).toBe(20);
});

test('limb maxima are shares of max HP', () => {
  expect(limbMax(100, 'arm_left')).toBe(20);
  expect(limbMax(100, 'arm_right')).toBe(20);
  expect(limbMax(100, 'leg_left')).toBe(25);
  expect(limbMax(100, 'leg_right')).toBe(25);
  expect(limbMax(100, 'torso')).toBe(100);
  expect(limbMax(100, 'head')).toBe(30);
  expect(limbMax(10, 'leg_left')).toBe(2);
});

test('higher reaction goes first at the same issuedAtMs', () => {
  const actions = [
    { id: 'slow', reaction: 10, issuedAtMs: 500 },
    { id: 'fast', reaction: 12, issuedAtMs: 500 },
  ];
  const ordered = orderByInitiative(actions, mulberry32(1));
  expect(ordered.map((action) => action.id)).toEqual(['fast', 'slow']);
  expect(actions.map((action) => action.id)).toEqual(['slow', 'fast']);
});

test('equal reaction changes order only with the rng seed', () => {
  const actions = [
    { id: 'first', reaction: 10, issuedAtMs: 0 },
    { id: 'second', reaction: 10, issuedAtMs: 0 },
  ];
  expect(orderByInitiative(actions, mulberry32(3)).map((action) => action.id)).toEqual([
    'first',
    'second',
  ]);
  expect(orderByInitiative(actions, mulberry32(1)).map((action) => action.id)).toEqual([
    'second',
    'first',
  ]);
  expect(orderByInitiative(actions, mulberry32(3)).map((action) => action.id)).toEqual([
    'first',
    'second',
  ]);
  expect(actions.map((action) => action.id)).toEqual(['first', 'second']);
});

test('an earlier issuedAtMs beats a higher reaction', () => {
  const actions = [
    { id: 'late-fast', reaction: 20, issuedAtMs: 200 },
    { id: 'early-slow', reaction: 1, issuedAtMs: 100 },
  ];
  expect(orderByInitiative(actions, mulberry32(1)).map((action) => action.id)).toEqual([
    'early-slow',
    'late-fast',
  ]);
});

test('armor cannot reduce damage below 1', () => {
  const attacker = combatant({ id: 'a', accuracyStat: 10, accuracyScore: 10, od: 2 });
  const target = combatant({ id: 'b', armor: 999, evasion: 0, hp: 10, od: 0 });
  const result = resolveAttack(attack({ attacker, target, weaponDamage: 10 }));

  expect(result.ok).toBe(true);
  if (!result.ok) {
    return;
  }
  expect(result.value.damage).toBe(1);
  expect(result.value.target.hp).toBe(9);
});

test('aiming without the extra OD is rejected and leaves both combatants unchanged', () => {
  const attacker = combatant({ id: 'a', od: 1 });
  const target = combatant({ id: 'b', hp: 40, od: 3 });
  const beforeAttacker = { ...attacker, limbs: { ...attacker.limbs } };
  const beforeTarget = { ...target, limbs: { ...target.limbs } };
  const result = resolveAttack(attack({ attacker, target, odCost: 1, aim: 'head' }));

  expect(result).toEqual({ ok: false, code: 'no_od' });
  expect(attacker).toEqual(beforeAttacker);
  expect(target).toEqual(beforeTarget);
});

test('missing line of sight on a ranged attack spends nothing', () => {
  const attacker = combatant({ id: 'a', od: 3 });
  const target = combatant({ id: 'b' });
  const result = resolveAttack(attack({ attacker, target, melee: false, los: false, distance: 4 }));
  expect(result).toEqual({ ok: false, code: 'los' });
  expect(attacker.od).toBe(3);
});

test('a stunned attacker is rejected before a downed attacker and before OD is spent', () => {
  const stunned = combatant({ id: 'a', stunned: true, downed: true, od: 1 });
  const target = combatant({ id: 'b' });
  expect(resolveAttack(attack({ attacker: stunned, target, odCost: 2 }))).toEqual({
    ok: false,
    code: 'stun_blocked',
  });
  expect(stunned.od).toBe(1);

  const downed = combatant({ id: 'c', downed: true, od: 4 });
  expect(resolveAttack(attack({ attacker: downed, target }))).toEqual({
    ok: false,
    code: 'downed_attacker',
  });
  expect(downed.od).toBe(4);
});

test('a dead target is rejected before other attack checks', () => {
  const attacker = combatant({ id: 'a', od: 0, stunned: true });
  const target = combatant({ id: 'b', alive: false });
  expect(resolveAttack(attack({ attacker, target, safeZone: true }))).toEqual({
    ok: false,
    code: 'dead',
  });
});
