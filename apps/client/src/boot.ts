import { RACES } from '@rift/domain/character';
import { createAudioBus, createMemorySink, type AudioBus } from './audio/bus';
import { DEFAULT_BINDINGS, rebind } from './input';
import { t, type Locale } from './i18n/translate';
import { normalizeSettings, type Settings } from './i18n/settings';
import { buildFrame, type SpriteDesc } from './render/frame';
import { createCamera, type Camera } from './render/camera';
import { createClientStore, type ClientStore } from './state/store';
import {
  creationPreview,
  creationRaceIds,
  menuModel,
  type Appearance,
  type CreationPreview,
  type MenuModel,
  type StatBlock,
} from './ui/models';

/** Prototype creation. The catalog still contains all eight races. */
export const PLAYABLE_RACES = ['human', 'demon'] as const;

export const LOCALES = ['ru', 'en'] as const;

/** Shown when the sidecar process did not answer ping. */
export const SIDECAR_UNAVAILABLE = 'сайдкар недоступен';

/**
 * World entry needs a sidecar pong, or the dev-only mock flag.
 * A production build passes `devMock: false` and stays on the menu without pong.
 */
export function canEnterWorld(pong: boolean, devMock: boolean): boolean {
  return pong || devMock;
}

/** `VITE_SIDECAR_MOCK=1` counts only while Vite is in dev. It never posts a login. */
export function devMockEnabled(env: { DEV?: boolean; VITE_SIDECAR_MOCK?: string }): boolean {
  return env.DEV === true && env.VITE_SIDECAR_MOCK === '1';
}

export type ClientScreen = 'menu' | 'creation';

export interface PlayResult {
  screen: ClientScreen;
  callsNetwork: false;
}

/**
 * Play opens local character creation when the world may be entered.
 * It does not call the network and does not POST a login.
 */
export function playAction(pong: boolean, devMock: boolean): PlayResult {
  if (!canEnterWorld(pong, devMock)) {
    return { screen: 'menu', callsNetwork: false };
  }
  return { screen: 'creation', callsNetwork: false };
}

const CONNECTED = {
  state: 'createClientStore',
  net: 'createClientNet',
  input: 'DEFAULT_BINDINGS',
  ui: 'models',
  render: 'buildFrame',
  i18n: 't',
  audio: 'createAudioBus',
} as const;

export interface BootPlan {
  /** Modules this boot attaches. Net is not opened: play never calls it. */
  modules: typeof CONNECTED;
  /** Movement prediction is published only through `store.setPredicted`. */
  prediction: 'setPredicted';
  /** The client does not spawn the sidecar. Server AI falls back after 200 ms. */
  spawnsSidecar: false;
  store: ClientStore;
  createClientStore: typeof createClientStore;
  settings: Settings;
  normalizeSettings: typeof normalizeSettings;
  t: typeof t;
  locales: readonly Locale[];
  playableRaces: readonly string[];
  playerRaces: readonly string[];
  botRaces: readonly string[];
  menu: MenuModel;
  menuModel: typeof menuModel;
  bindings: Record<string, string>;
  rebind: typeof rebind;
  audio: AudioBus;
  createAudioBus: typeof createAudioBus;
  camera: Camera;
  createCamera: typeof createCamera;
  frame: SpriteDesc[];
  buildFrame: typeof buildFrame;
}

const LOCAL_APPEARANCE: Appearance = {
  skin: 'fair',
  hair: 'brown',
  eyes: 'green',
  horns: false,
  ears: 'round',
  tattoos: 'none',
  scars: 'none',
  heightCm: 180,
  build: 'average',
};

const LOCAL_POINTS: StatBlock = {
  body: 10,
  reaction: 5,
  accuracy: 5,
  will: 0,
  perception: 0,
  technique: 0,
};

/** Local creation view-model. No server round-trip. */
export function localCreationPreview(): CreationPreview {
  return creationPreview({
    raceId: 'human',
    controller: 'player',
    clean: false,
    name: 'Pilot',
    appearance: LOCAL_APPEARANCE,
    points: LOCAL_POINTS,
  });
}

/**
 * Connects the client modules that can run without a socket, a sidecar process,
 * or a WebGL renderer. `createClientNet` stays closed until a caller passes this
 * store in; prediction then writes only through `setPredicted`.
 */
export function createBootPlan(): BootPlan {
  const settings = normalizeSettings({});
  const audio = createAudioBus(createMemorySink());
  audio.setSubtitles(settings.subtitles);
  const playableRaces: readonly string[] = PLAYABLE_RACES;
  const races = RACES.map((race) => ({ id: race.id, side: race.side }));
  const origin = { x: 0, y: 0 };
  const facing = 'e' as const;
  return {
    modules: CONNECTED,
    prediction: 'setPredicted',
    spawnsSidecar: false,
    store: createClientStore(),
    createClientStore,
    settings,
    normalizeSettings,
    t,
    locales: LOCALES,
    playableRaces,
    playerRaces: creationRaceIds({ races, playableRaces, controller: 'player' }),
    botRaces: creationRaceIds({ races, playableRaces, controller: 'bot' }),
    menu: menuModel(),
    menuModel,
    bindings: { ...DEFAULT_BINDINGS },
    rebind,
    audio,
    createAudioBus,
    camera: createCamera(origin, facing, 0),
    createCamera,
    frame: buildFrame({
      origin,
      facing,
      vision: 0,
      blocked: [],
      entities: [],
    }),
    buildFrame,
  };
}
