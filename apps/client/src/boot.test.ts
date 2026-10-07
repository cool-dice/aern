import { createAudioBus } from './audio/bus';
import { createBootPlan, canEnterWorld, devMockEnabled, localCreationPreview, playAction } from './boot';
import { DEFAULT_BINDINGS, rebind } from './input';
import { normalizeSettings } from './i18n/settings';
import { t } from './i18n/translate';
import { createClientNet, createMemorySocket } from './net';
import { buildFrame } from './render/frame';
import { createCamera } from './render/camera';
import { createClientStore } from './state/store';
import { menuModel } from './ui/models';
import { expect, test } from 'vitest';

test('canEnterWorld is true only with pong or the dev mock', () => {
  expect(canEnterWorld(false, false)).toBe(false);
  expect(canEnterWorld(true, false)).toBe(true);
  expect(canEnterWorld(false, true)).toBe(true);
  expect(canEnterWorld(true, true)).toBe(true);
});

test('the dev mock flag is ignored outside Vite dev', () => {
  expect(devMockEnabled({ DEV: true, VITE_SIDECAR_MOCK: '1' })).toBe(true);
  expect(devMockEnabled({ DEV: false, VITE_SIDECAR_MOCK: '1' })).toBe(false);
  expect(devMockEnabled({ DEV: true, VITE_SIDECAR_MOCK: '0' })).toBe(false);
  expect(devMockEnabled({ DEV: true })).toBe(false);
});

test('play stays on the menu without a network call until entry is allowed', () => {
  expect(playAction(false, false)).toEqual({ screen: 'menu', callsNetwork: false });
  expect(playAction(true, false)).toEqual({ screen: 'creation', callsNetwork: false });
  expect(playAction(false, true)).toEqual({ screen: 'creation', callsNetwork: false });
});

test('boot plan connects modules, Russian defaults, and prototype races', () => {
  const plan = createBootPlan();

  expect(plan.modules).toEqual({
    state: 'createClientStore',
    net: 'createClientNet',
    input: 'DEFAULT_BINDINGS',
    ui: 'models',
    render: 'buildFrame',
    i18n: 't',
    audio: 'createAudioBus',
  });
  expect(plan.prediction).toBe('setPredicted');
  expect(plan.spawnsSidecar).toBe(false);

  expect(plan.createClientStore).toBe(createClientStore);
  expect(plan.store.getState().setPredicted).toBeTypeOf('function');
  plan.store.getState().setPredicted({ cell: { x: 1, y: 2 }, steps: [] });
  expect(plan.store.getState().predictedCell).toEqual({ x: 1, y: 2 });
  expect(plan.store.getState().self).toBeNull();

  expect(plan.normalizeSettings).toBe(normalizeSettings);
  expect(plan.t).toBe(t);
  expect(plan.settings).toEqual(normalizeSettings({}));
  expect(plan.settings.locale).toBe('ru');
  expect(plan.settings.subtitles).toBe(false);
  expect(plan.locales).toEqual(['ru', 'en']);
  expect(plan.t('ru', 'ui.brand')).toBe('Разлом');
  expect(plan.t('en', 'ui.brand')).toBe('Rift');

  expect(plan.playableRaces).toEqual(['human', 'demon']);
  expect(plan.playerRaces).toEqual(['human']);
  expect(plan.botRaces).toEqual(['demon']);
  expect(plan.menuModel).toBe(menuModel);
  expect(plan.menu.actions.map((action) => action.id)).toEqual([
    'play',
    'profile',
    'settings',
    'exit',
  ]);
  expect(localCreationPreview().ok).toBe(true);

  expect(plan.bindings).toEqual({ ...DEFAULT_BINDINGS });
  expect(plan.bindings).not.toBe(DEFAULT_BINDINGS);
  expect(plan.rebind).toBe(rebind);
  expect(plan.rebind(plan.bindings, 'map', 'KeyE').map).toBe('KeyE');

  expect(plan.createAudioBus).toBe(createAudioBus);
  expect(plan.audio.subtitlesEnabled()).toBe(false);

  expect(plan.buildFrame).toBe(buildFrame);
  expect(plan.createCamera).toBe(createCamera);
  expect(plan.camera).toEqual({ origin: { x: 0, y: 0 }, facing: 'e', vision: 0 });
  expect(plan.frame.some((sprite) => sprite.id === 'self')).toBe(true);
});

test('client net attaches to the boot store and does not listen', () => {
  const plan = createBootPlan();
  const socket = createMemorySocket();
  const net = createClientNet({
    store: plan.store,
    sessionKeyHex: '00112233445566778899aabbccddeeff',
    socket,
    movement: { reaction: 5, inCombat: false },
  });

  expect(plan.modules.net).toBe('createClientNet');
  expect(net.queue.lastSeq).toBe(0);
  expect(socket.sent).toEqual([]);
  expect(socket.closed).toBe(false);
  net.close();
  expect(socket.closed).toBe(true);
  expect(plan.store.getState().connected).toBe(false);
});
