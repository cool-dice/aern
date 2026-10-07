import { useEffect, useMemo, useState } from 'react';
import {
  SIDECAR_UNAVAILABLE,
  canEnterWorld,
  createBootPlan,
  devMockEnabled,
  localCreationPreview,
  playAction,
  type ClientScreen,
} from './boot';
import { t } from './i18n/translate';
import { CreationScreen } from './ui/screens';

/**
 * Menu shell. The sidecar is not spawned here. Without pong (or the dev mock)
 * Play stays on the menu and does not call the network.
 */
export function App() {
  const env = import.meta.env as { DEV?: boolean; VITE_SIDECAR_MOCK?: string };
  const devMock = devMockEnabled(env);
  const plan = useMemo(() => createBootPlan(), []);
  const [requested, setRequested] = useState<ClientScreen>('menu');
  const allowed = canEnterWorld(false, devMock);
  const screen: ClientScreen = allowed ? requested : 'menu';

  useEffect(() => {
    document.title = t(plan.settings.locale, plan.menu.brandKey);
  }, [plan]);

  if (screen === 'creation') {
    return (
      <section>
        <ul>
          {plan.playerRaces.map((raceId) => (
            <li key={raceId}>{t(plan.settings.locale, `race.${raceId}`)}</li>
          ))}
        </ul>
        <CreationScreen model={localCreationPreview()} />
      </section>
    );
  }

  return (
    <main>
      <h1>{t(plan.settings.locale, plan.menu.brandKey)}</h1>
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
              {t(plan.settings.locale, action.labelKey)}
            </button>
          </li>
        ))}
      </ul>
      {allowed ? null : <p>{SIDECAR_UNAVAILABLE}</p>}
    </main>
  );
}
