import { useEffect, useMemo, useState } from 'react';
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
import {
  bindKeyboard,
  characterBody,
  createPlaySession,
  enterWorld,
  loginBody,
  pressKey,
  registerBody,
  worldFrame,
} from './play/session';

/**
 * Menu, creation, and the world frame. Play uses the session store, keyboard
 * bindings, and `buildFrame`. The sidecar line is a localization key.
 */
export function App() {
  const env = import.meta.env as { DEV?: boolean; VITE_SIDECAR_MOCK?: string };
  const devMock = devMockEnabled(env);
  const plan = useMemo(() => createBootPlan(), []);
  const session = useMemo(() => createPlaySession(plan.store), [plan]);
  const [requested, setRequested] = useState<ClientScreen>('menu');
  const [frame, setFrame] = useState(0);
  const allowed = canEnterWorld(false, devMock);
  const screen: ClientScreen = allowed ? requested : 'menu';
  const locale = plan.settings.locale;

  useEffect(() => {
    document.title = t(locale, plan.menu.brandKey);
  }, [plan, locale]);

  useEffect(() => {
    return bindKeyboard(window, (code) => {
      pressKey(session, code);
      setFrame((value) => value + 1);
    });
  }, [session]);

  const self = plan.store.getState().self;
  const sprites = worldFrame(session);

  if (screen === 'creation' || self !== null) {
    return (
      <main data-frame={frame}>
        <section>
          <ul>
            {plan.playerRaces.map((raceId) => (
              <li key={raceId}>{t(locale, `race.${raceId}`)}</li>
            ))}
          </ul>
          <CreationScreen model={localCreationPreview()} />
          <button
            type="button"
            onClick={() => {
              const created = characterBody({ accountId: 'local', name: 'Lia', raceId: 'human' });
              enterWorld(session, created.body.name);
              setFrame((value) => value + 1);
            }}
          >
            {t(locale, 'ui.menu.play')}
          </button>
        </section>
        {self === null ? null : (
          <section>
            <canvas data-pixi="frame" width={800} height={600} />
            <ul>
              {sprites.map((sprite) => (
                <li key={sprite.id} data-sprite={sprite.id}>
                  {sprite.image}
                </li>
              ))}
            </ul>
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
                enemies: [],
              })}
            />
          </section>
        )}
      </main>
    );
  }

  return (
    <main>
      <h1>{t(locale, plan.menu.brandKey)}</h1>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          const data = new FormData(event.currentTarget);
          const email = String(data.get('email') ?? '');
          const password = String(data.get('password') ?? '');
          const mode = String(data.get('mode') ?? 'login');
          const request = mode === 'register' ? registerBody(email, password) : loginBody(email, password);
          plan.store.getState().pushLog(`${request.method} ${request.url}`);
          setFrame((value) => value + 1);
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
                const next = playAction(false, devMock);
                setRequested(next.screen);
              }}
            >
              {t(locale, action.labelKey)}
            </button>
          </li>
        ))}
      </ul>
      {allowed ? null : <p>{t(locale, 'ui.sidecar.unavailable')}</p>}
    </main>
  );
}
