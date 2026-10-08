import { useEffect, useMemo, useRef, useState } from 'react';
import {
  canEnterWorld,
  createBootPlan,
  devMockEnabled,
  localCreationPreview,
  playAction,
  type ClientScreen,
} from './boot';
import { t } from './i18n/translate';
import { hudModel } from './ui/models';
import { CreationScreen, HudScreen } from './ui/screens';
import { PlayPanels } from './play/screens';
import { spawnMockSidecar } from './play/sidecar';
import {
  bindKeyboard,
  characterBody,
  createPlaySession,
  enterWorld,
  loginBody,
  commandForDowned,
  pressKey,
  registerBody,
  worldFrame,
  type PlayScreen,
} from './play/session';
import { createClientNet, type ClientNet } from './net';
import { createApplication } from './render/pixi-app';

const SERVER = readServer();

/**
 * Menu, creation, and the world frame. Play posts auth, mounts Pixi, and
 * applies server snapshots. Key commands are sent on the socket or `/command`.
 */
export function App() {
  const env = import.meta.env as { DEV?: boolean; VITE_SIDECAR_MOCK?: string };
  const devMock = devMockEnabled(env);
  const plan = useMemo(() => createBootPlan(), []);
  const session = useMemo(() => createPlaySession(plan.store), [plan]);
  const [requested, setRequested] = useState<ClientScreen>('menu');
  const [frame, setFrame] = useState(0);
  const [pong, setPong] = useState(false);
  const [sidecarError, setSidecarError] = useState<string | null>(null);
  const [renderError, setRenderError] = useState<string | null>(null);
  const [accountId, setAccountId] = useState<string | null>(null);
  const hostRef = useRef<HTMLDivElement | null>(null);
  const netRef = useRef<ClientNet | null>(null);
  const openRef = useRef(false);
  const nowRef = useRef(0);
  const seqRef = useRef(1);
  const tokenRef = useRef<string | null>(null);
  const allowed = canEnterWorld(pong, devMock);
  const screen: ClientScreen = allowed ? requested : 'menu';
  const locale = plan.settings.locale;

  useEffect(() => {
    document.title = t(locale, plan.menu.brandKey);
  }, [plan, locale]);

  useEffect(() => {
    const sidecar = spawnMockSidecar({
      start: true,
      onPong: () => {
        setPong(true);
      },
    });
    if (sidecar.error !== null) {
      setSidecarError(sidecar.error);
    }
    let cancelled = false;
    void createApplication({ width: 800, height: 600 })
      .then((scene) => {
        if (cancelled) {
          return;
        }
        const canvas = scene.canvas;
        if (canvas instanceof HTMLElement) {
          hostRef.current?.replaceChildren(canvas);
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setRenderError(error instanceof Error ? error.message : 'pixi');
        }
      });
    return () => {
      cancelled = true;
      sidecar.stop();
      netRef.current?.close();
    };
  }, []);

  useEffect(() => {
    return bindKeyboard(window, (code) => {
      const command = pressKey(session, code);
      if (command !== null) {
        void sendKey(command);
      }
      setFrame((value) => value + 1);
    });
  }, [session]);

  useEffect(() => {
    if (accountId === null) {
      return;
    }
    let stopped = false;
    const pull = async () => {
      try {
        const response = await fetch(`${SERVER}/state`);
        if (!response.ok || stopped) {
          return;
        }
        const payload = (await response.json()) as { nowMs?: number };
        applyServer(payload);
      } catch (error) {
        if (!stopped) {
          plan.store.getState().pushLog(error instanceof Error ? error.message : 'state');
        }
      }
    };
    void pull();
    const timer = setInterval(() => {
      void pull();
    }, 200);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [accountId, plan, session]);

  function applyServer(payload: { nowMs?: number }): void {
    const now = typeof payload.nowMs === 'number' ? payload.nowMs : nowRef.current;
    nowRef.current = now;
    if (netRef.current !== null) {
      netRef.current.ingest(payload, now);
    } else {
      plan.store.getState().applySnapshot(payload);
    }
    const first = Object.values(plan.store.getState().entities)[0];
    if (first !== undefined) {
      session.targetId = first.id;
    }
    const respawn = commandForDowned(session.store.getState().self?.phase);
    if (respawn !== null) {
      void sendKey(respawn);
    }
    setFrame((value) => value + 1);
  }

  async function sendKey(action: string): Promise<void> {
    const self = session.store.getState().self;
    const issuedAtMs = nowRef.current;
    const params = {
      entityId: self?.id ?? '',
      ...(action.startsWith('attack') ? { weaponDamage: 8, range: 8, odCost: 1 } : {}),
    };
    const targetId = action.startsWith('attack') ? session.targetId ?? undefined : undefined;
    if (openRef.current && netRef.current !== null) {
      netRef.current.send(action, issuedAtMs, {
        params,
        ...(targetId !== undefined ? { targetId } : {}),
      });
      return;
    }
    const seq = seqRef.current;
    seqRef.current += 1;
    await fetch(`${SERVER}/command`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        commandId: `key-${String(seq)}`,
        seq,
        issuedAtMs,
        action,
        ...(targetId !== undefined ? { targetId } : {}),
        params,
      }),
    });
  }

  async function openSocket(accessToken: string, sessionKey: string): Promise<void> {
    tokenRef.current = accessToken;
    const raw = new WebSocket(SERVER.replace(/^http/, 'ws'));
    const socket = {
      send(data: string) {
        const parsed = JSON.parse(data) as Record<string, unknown>;
        parsed.accessToken = tokenRef.current;
        if (raw.readyState === WebSocket.OPEN) {
          raw.send(JSON.stringify(parsed));
        }
      },
      close() {
        raw.close();
      },
    };
    const net = createClientNet({
      store: plan.store,
      sessionKeyHex: sessionKey,
      socket,
      movement: { reaction: 10, inCombat: false },
    });
    netRef.current = net;
    raw.addEventListener('open', () => {
      openRef.current = true;
    });
    raw.addEventListener('close', () => {
      openRef.current = false;
    });
    raw.addEventListener('message', (event) => {
      const message = JSON.parse(String(event.data)) as {
        channel?: string;
        payload?: { nowMs?: number };
        sentAtMs?: number;
      };
      if (message.channel !== 'state' || message.payload === undefined) {
        return;
      }
      const payload = message.payload;
      if (typeof message.sentAtMs === 'number') {
        payload.nowMs = message.sentAtMs;
      }
      applyServer(payload);
    });
  }

  async function submitAuth(email: string, password: string, mode: string): Promise<void> {
    const request = mode === 'register' ? registerBody(email, password) : loginBody(email, password);
    const response = await fetch(`${SERVER}${request.url}`, {
      method: request.method,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(request.body),
    });
    const payload = (await response.json()) as {
      accountId?: string;
      accessToken?: string;
      sessionKey?: string;
      code?: string;
    };
    plan.store.getState().pushLog(`${request.method} ${request.url} ${String(response.status)}`);
    if (!response.ok) {
      plan.store.getState().pushLog(payload.code ?? 'auth');
      setFrame((value) => value + 1);
      return;
    }
    if (typeof payload.accountId === 'string') {
      setAccountId(payload.accountId);
    }
    if (typeof payload.accessToken === 'string' && typeof payload.sessionKey === 'string') {
      await openSocket(payload.accessToken, payload.sessionKey);
    }
    if (allowed) {
      setRequested('creation');
    }
    setFrame((value) => value + 1);
  }

  async function createCharacter(): Promise<void> {
    if (accountId === null) {
      return;
    }
    const created = characterBody({ accountId, name: 'Lia', raceId: 'human' });
    const response = await fetch(`${SERVER}${created.url}`, {
      method: created.method,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(created.body),
    });
    const payload = (await response.json()) as { characterId?: string; code?: string };
    if (!response.ok || typeof payload.characterId !== 'string') {
      plan.store.getState().pushLog(payload.code ?? 'character');
      setFrame((value) => value + 1);
      return;
    }
    enterWorld(session, payload.characterId);
    const state = await fetch(`${SERVER}/state`);
    if (state.ok) {
      applyServer((await state.json()) as { nowMs?: number });
    }
    setFrame((value) => value + 1);
  }

  function openPanel(next: PlayScreen): void {
    session.screen = next;
    setFrame((value) => value + 1);
  }

  const self = plan.store.getState().self;
  const sprites = worldFrame(session);

  return (
    <main data-frame={frame}>
      <div ref={hostRef} data-pixi="host" />
      {sidecarError === null ? null : <p data-sidecar="error">{sidecarError}</p>}
      {renderError === null ? null : <p data-pixi="error">{renderError}</p>}
      {screen === 'creation' || self !== null ? (
        <section>
          <ul>
            {plan.playerRaces.map((raceId) => (
              <li key={raceId}>{t(locale, `race.${raceId}`)}</li>
            ))}
          </ul>
          <CreationScreen model={localCreationPreview()} />
          <button type="button" onClick={() => void createCharacter()}>
            {t(locale, 'ui.menu.play')}
          </button>
        </section>
      ) : (
        <section>
          <h1>{t(locale, plan.menu.brandKey)}</h1>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              const data = new FormData(event.currentTarget);
              const email = String(data.get('email') ?? '');
              const password = String(data.get('password') ?? '');
              const mode = String(data.get('mode') ?? 'login');
              void submitAuth(email, password, mode);
            }}
          >
            <input name="email" type="email" />
            <input name="password" type="password" />
            <button type="submit" name="mode" value="register">
              {t(locale, 'ui.menu.play')}
            </button>
            <button type="submit" name="mode" value="login">
              {t(locale, 'ui.menu.settings')}
            </button>
          </form>
          <ul>
            {plan.menu.actions.map((action) => (
              <li key={action.id}>
                <button
                  type="button"
                  onClick={() => {
                    if (action.id !== 'play') {
                      return;
                    }
                    const next = playAction(pong, devMock);
                    setRequested(next.screen);
                  }}
                >
                  {t(locale, action.labelKey)}
                </button>
              </li>
            ))}
          </ul>
          {allowed ? null : <p>{t(locale, 'ui.sidecar.unavailable')}</p>}
        </section>
      )}
      {self === null ? null : (
        <section>
          <ul>
            {sprites.map((sprite) => (
              <li key={sprite.id} data-sprite={sprite.id}>
                {sprite.image}
              </li>
            ))}
          </ul>
          <nav>
            {(
              [
                'inventory',
                'craft',
                'quests',
                'map',
                'chat',
                'trade',
                'hack',
                'settings',
              ] as const
            ).map((panel) => (
              <button key={panel} type="button" onClick={() => openPanel(panel)}>
                {panel}
              </button>
            ))}
          </nav>
          <PlayPanels session={session} />
          <HudScreen
            model={hudModel({
              hp: self.hp,
              maxHp: self.maxHp,
              od: self.od,
              odLimit: self.odLimit,
              nn: 0,
              nnLimit: 100,
              gold: self.gold,
              level: self.level,
              hint: null,
              inCombat: false,
              statuses: [],
              allies: [],
              enemies:
                self.phase === 'downed' || self.hp <= 0
                  ? [{ id: 'downed', hp: self.hp, maxHp: self.maxHp, statuses: [], distance: 0 }]
                  : [],
            })}
          />
        </section>
      )}
    </main>
  );
}

function readServer(): string {
  const env = import.meta.env as { VITE_SERVER_URL?: string };
  if (typeof env.VITE_SERVER_URL === 'string' && env.VITE_SERVER_URL.length > 0) {
    return env.VITE_SERVER_URL;
  }
  return 'http://127.0.0.1:8080';
}
