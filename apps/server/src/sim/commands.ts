import { DIRS, type Dir } from '@rift/domain/movement';
import type { ClientCommand } from '@rift/protocol';
import type { AttackCommand, MoveCommand, SimCommand } from './tick';

const DIR_SET = new Set<string>(DIRS);

/**
 * Catalog actions from the 64-id list. `move` is not an action id.
 * `step_*` walks, `run_*` spends a run, `attack_*` hits in melee or at range.
 */
export function toSimCommand(command: ClientCommand): SimCommand | null {
  if (command.action.startsWith('step_') || command.action.startsWith('run_')) {
    return toMove(command);
  }
  if (command.action === 'attack_melee' || command.action === 'attack_ranged') {
    return toAttack(command);
  }
  return null;
}

function toMove(command: ClientCommand): MoveCommand | null {
  const running = command.action.startsWith('run_');
  const dir = command.action.slice(running ? 4 : 5);
  const entityId = command.params.entityId;
  if (typeof entityId !== 'string' || !isDir(dir)) {
    return null;
  }
  return {
    type: 'move',
    entityId,
    dir,
    running,
    issuedAtMs: command.issuedAtMs,
  };
}

function toAttack(command: ClientCommand): AttackCommand | null {
  const entityId = command.params.entityId;
  if (typeof entityId !== 'string' || command.targetId === undefined) {
    return null;
  }
  const melee = command.action === 'attack_melee';
  const weaponDamage = command.params.weaponDamage;
  const odCost = command.params.odCost;
  const range = command.params.range;
  return {
    type: 'attack',
    attackerId: entityId,
    targetId: command.targetId,
    weaponDamage: typeof weaponDamage === 'number' ? weaponDamage : 2,
    odCost: typeof odCost === 'number' ? odCost : 1,
    range: typeof range === 'number' ? range : melee ? 1 : 8,
    los: command.params.los !== false,
    aim: null,
    melee,
    friendlyFire: command.params.friendlyFire === true,
    sameGroup: command.params.sameGroup === true,
    pvpOpen: command.params.pvpOpen === true,
    safeZone: command.params.safeZone === true,
    issuedAtMs: command.issuedAtMs,
  };
}

function isDir(value: string): value is Dir {
  return DIR_SET.has(value);
}
