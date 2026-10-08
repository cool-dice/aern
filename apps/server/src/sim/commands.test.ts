import type { ClientCommand } from '@rift/protocol';
import { expect, test } from 'vitest';
import { toSimCommand } from './commands';

function command(partial: Partial<ClientCommand> & Pick<ClientCommand, 'action'>): ClientCommand {
  return {
    commandId: 'c1',
    seq: 1,
    issuedAtMs: 50,
    action: partial.action,
    targetId: partial.targetId,
    params: partial.params ?? { entityId: 'hero' },
  };
}

test('step and run map onto the eight directions', () => {
  expect(toSimCommand(command({ action: 'step_e' }))).toEqual({
    type: 'move',
    entityId: 'hero',
    dir: 'e',
    running: false,
    issuedAtMs: 50,
  });
  expect(toSimCommand(command({ action: 'run_nw' }))).toEqual({
    type: 'move',
    entityId: 'hero',
    dir: 'nw',
    running: true,
    issuedAtMs: 50,
  });
  expect(
    toSimCommand(command({ action: 'step_s', params: { entityId: 'hero', to: 'plains_mine' } })),
  ).toMatchObject({ type: 'move', dir: 's', to: 'plains_mine' });
});

test('attacks keep melee versus ranged and the catalog target', () => {
  expect(toSimCommand(command({ action: 'attack_melee', targetId: 'rat' }))).toMatchObject({
    type: 'attack',
    attackerId: 'hero',
    targetId: 'rat',
    melee: true,
    range: 1,
    weaponDamage: 2,
  });
  expect(
    toSimCommand(
      command({
        action: 'attack_ranged',
        targetId: 'rat',
        params: { entityId: 'hero', weaponDamage: 6, range: 4 },
      }),
    ),
  ).toMatchObject({ melee: false, weaponDamage: 6, range: 4, aim: null });
  expect(
    toSimCommand(
      command({
        action: 'attack_melee',
        targetId: 'rat',
        params: { entityId: 'hero', aim: 'leg_left' },
      }),
    ),
  ).toMatchObject({ aim: 'leg_left' });
});

test('move is not a catalog id and a broken direction is dropped', () => {
  expect(toSimCommand(command({ action: 'move', params: { entityId: 'hero', dir: 'e' } }))).toBeNull();
  expect(toSimCommand(command({ action: 'step_up' }))).toBeNull();
  expect(toSimCommand(command({ action: 'attack_melee' }))).toBeNull();
  expect(toSimCommand(command({ action: 'scan' }))).toBeNull();
});
