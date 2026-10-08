import { expect, test } from 'vitest';
import { createClientStore } from '../state/store';
import {
  characterBody,
  commandForKey,
  createPlaySession,
  enterWorld,
  loginBody,
  pressKey,
  registerBody,
  worldFrame,
} from './session';

test('register and login build auth posts', () => {
  expect(registerBody('lia@example.com', 'correct-horse')).toEqual({
    method: 'POST',
    url: '/auth/register',
    body: { email: 'lia@example.com', password: 'correct-horse' },
  });
  expect(loginBody('lia@example.com', 'correct-horse').url).toBe('/auth/login');
});

test('character creation sends a prototype race and the point budget', () => {
  const human = characterBody({ accountId: 'acc', name: 'Lia', raceId: 'human' });
  const demon = characterBody({ accountId: 'acc', name: 'Kai', raceId: 'demon' });
  expect(human.body.raceId).toBe('human');
  expect(demon.body.raceId).toBe('demon');
  expect(human.body.points).toEqual({
    body: 10,
    reaction: 5,
    accuracy: 5,
    will: 0,
    perception: 0,
    technique: 0,
  });
});

test('enterWorld stores the player and the frame includes self', () => {
  const session = createPlaySession();
  expect(session.store.getState().self).toBeNull();
  enterWorld(session, 'lia');
  expect(session.store.getState().self).toMatchObject({ id: 'lia', facing: 'e', phase: 'online' });
  expect(worldFrame(session).some((sprite) => sprite.id === 'self')).toBe(true);
});

test('WASD is relative to facing east and attack uses the current target', () => {
  expect(commandForKey('KeyW', 'e', 'rat')).toBe('step_e');
  expect(commandForKey('KeyS', 'e', 'rat')).toBe('step_w');
  expect(commandForKey('KeyA', 'e', 'rat')).toBe('step_n');
  expect(commandForKey('KeyD', 'e', 'rat')).toBe('step_s');
  expect(commandForKey('MouseLeft', 'e', 'rat')).toBe('attack_melee');
  expect(commandForKey('MouseLeft', 'e', null)).toBeNull();
});

test('inventory and chat keys change the screen and write the log', () => {
  const store = createClientStore();
  const session = createPlaySession(store);
  enterWorld(session, 'lia');
  expect(pressKey(session, 'KeyI')).toBeNull();
  expect(session.screen).toBe('inventory');
  expect(store.getState().inventory[0]?.itemId).toBe('rusty_sword');
  session.chatDraft = 'hello rift';
  pressKey(session, 'Enter');
  expect(session.screen).toBe('chat');
  expect(store.getState().log).toEqual(['hello rift']);
});
