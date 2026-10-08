import { actionFor, DEFAULT_BINDINGS, type Dir } from '../input/bindings';
import { buildFrame, type SpriteDesc } from '../render/frame';
import type { ClientStore, SelfState } from '../state/store';
import { createClientStore } from '../state/store';

const FACINGS: readonly Dir[] = ['e', 'ne', 'n', 'nw', 'w', 'sw', 's', 'se'];

export type PlayScreen =
  | 'menu'
  | 'world'
  | 'inventory'
  | 'craft'
  | 'quests'
  | 'map'
  | 'chat'
  | 'trade'
  | 'hack'
  | 'settings';

export interface AuthRequest {
  method: 'POST';
  url: '/auth/register' | '/auth/login';
  body: { email: string; password: string };
}

export interface CharacterRequest {
  method: 'POST';
  url: '/characters';
  body: {
    accountId: string;
    name: string;
    raceId: 'human' | 'demon';
    clean: boolean;
    points: {
      body: number;
      reaction: number;
      accuracy: number;
      will: number;
      perception: number;
      technique: number;
    };
    appearance: {
      skin: string;
      hair: string;
      eyes: string;
      horns: boolean;
      ears: string;
      tattoos: string;
      scars: string;
      heightCm: number;
      build: string;
    };
  };
}

export interface PlaySession {
  store: ClientStore;
  screen: PlayScreen;
  targetId: string | null;
  locale: 'ru' | 'en';
  chatDraft: string;
}

export function createPlaySession(store: ClientStore = createClientStore()): PlaySession {
  return { store, screen: 'menu', targetId: null, locale: 'ru', chatDraft: '' };
}

export function registerBody(email: string, password: string): AuthRequest {
  return { method: 'POST', url: '/auth/register', body: { email, password } };
}

export function loginBody(email: string, password: string): AuthRequest {
  return { method: 'POST', url: '/auth/login', body: { email, password } };
}

const CREATION_POINTS = {
  body: 10,
  reaction: 5,
  accuracy: 5,
  will: 0,
  perception: 0,
  technique: 0,
} as const;

const CREATION_APPEARANCE = {
  skin: 'fair',
  hair: 'brown',
  eyes: 'green',
  horns: false,
  ears: 'round',
  tattoos: 'none',
  scars: 'none',
  heightCm: 180,
  build: 'average',
} as const;

export function characterBody(input: {
  accountId: string;
  name: string;
  raceId: 'human' | 'demon';
}): CharacterRequest {
  return {
    method: 'POST',
    url: '/characters',
    body: {
      accountId: input.accountId,
      name: input.name,
      raceId: input.raceId,
      clean: false,
      points: { ...CREATION_POINTS },
      appearance: { ...CREATION_APPEARANCE },
    },
  };
}

export function enterWorld(session: PlaySession, id: string): SelfState {
  const self: SelfState = {
    id,
    hp: 40,
    maxHp: 40,
    od: 5,
    odLimit: 5,
    cell: { x: 0, y: 0 },
    facing: 'e',
    phase: 'online',
    level: 1,
    gold: 100,
  };
  session.store.getState().applySnapshot({
    self,
    entities: {
      rat: { id: 'rat', cell: { x: 3, y: 0 } },
    },
    inventory: [{ id: 'bag-sword', itemId: 'rusty_sword', qty: 1 }],
  });
  session.store.getState().setConnected(true);
  session.screen = 'world';
  session.targetId = 'rat';
  return self;
}

function turn(facing: Dir, steps: number): Dir {
  const index = FACINGS.indexOf(facing);
  const next = FACINGS[(index + steps + FACINGS.length) % FACINGS.length];
  return next ?? 'e';
}

/** Screen-relative step while the camera faces east by default. */
export function stepFor(action: string, facing: Dir): string | null {
  if (action === 'move_forward') {
    return `step_${facing}`;
  }
  if (action === 'move_back') {
    return `step_${turn(facing, 4)}`;
  }
  if (action === 'move_left') {
    return `step_${turn(facing, 2)}`;
  }
  if (action === 'move_right') {
    return `step_${turn(facing, 6)}`;
  }
  return null;
}

const SCREEN_ACTIONS: Record<string, PlayScreen> = {
  inventory: 'inventory',
  craft: 'craft',
  quests: 'quests',
  map: 'map',
  chat: 'chat',
  menu: 'settings',
};

/** A downed character asks the server to run respawnAtBind. */
export function commandForDowned(phase: string | undefined): string | null {
  return phase === 'downed' ? 'respawn' : null;
}

export function commandForKey(code: string, facing: Dir, targetId: string | null): string | null {
  const action = actionFor(DEFAULT_BINDINGS, code);
  if (action === null) {
    return null;
  }
  const step = stepFor(action, facing);
  if (step !== null) {
    return step;
  }
  if (action === 'attack' && targetId !== null) {
    return 'attack_melee';
  }
  return null;
}

export function pressKey(session: PlaySession, code: string): string | null {
  const action = actionFor(DEFAULT_BINDINGS, code);
  if (code === 'Digit1') {
    session.screen = 'hack';
  }
  if (code === 'Digit2') {
    session.screen = 'trade';
  }
  if (action !== null && SCREEN_ACTIONS[action] !== undefined) {
    session.screen = SCREEN_ACTIONS[action] ?? session.screen;
    if (action === 'chat') {
      const line = session.chatDraft.trim();
      if (line.length > 0) {
        session.store.getState().pushLog(line);
        session.chatDraft = '';
      }
    }
  }
  const self = session.store.getState().self;
  const facing = (self?.facing ?? 'e') as Dir;
  return commandForKey(code, facing, session.targetId);
}

export function worldFrame(session: PlaySession): SpriteDesc[] {
  const state = session.store.getState();
  const origin = state.self?.cell ?? { x: 0, y: 0 };
  const facing = ((state.self?.facing ?? 'e') as Dir);
  return buildFrame({
    origin,
    facing,
    vision: 4,
    blocked: [],
    entities: Object.values(state.entities).map((entity) => ({
      id: entity.id,
      cell: entity.cell,
      image: 'mob',
    })),
  });
}

export function bindKeyboard(
  target: { addEventListener(type: 'keydown', listener: (event: { code: string }) => void): void; removeEventListener(type: 'keydown', listener: (event: { code: string }) => void): void },
  onKey: (code: string) => void,
): () => void {
  const listener = (event: { code: string }) => {
    onKey(event.code);
  };
  target.addEventListener('keydown', listener);
  return () => {
    target.removeEventListener('keydown', listener);
  };
}
