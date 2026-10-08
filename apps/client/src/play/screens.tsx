import type { ReactElement } from 'react';
import { playTone } from '../audio/bus';
import type { AudioBus } from '../audio/bus';
import { startGeneratedTone } from '../audio/tone';
import { normalizeSettings, type Settings } from '../i18n/settings';
import {
  ChatScreen,
  CraftScreen,
  HackScreen,
  InventoryScreen,
  MapScreen,
  QuestScreen,
  SettingsScreen,
  TradeScreen,
} from '../ui/screens';
import {
  hackModel,
  inventoryModel,
  mapModel,
  questModel,
  settingsModel,
  tradeModel,
  type InventoryItem,
} from '../ui/models';
import type { PlaySession } from './session';

export function noteDamage(bus: AudioBus): { frequency: number; started: boolean } {
  playTone(bus, 'damage');
  return startGeneratedTone('damage');
}

export function applyLocale(session: PlaySession, locale: string): Settings {
  const next = normalizeSettings({ locale: locale === 'en' ? 'en' : 'ru' });
  session.locale = next.locale;
  return next;
}

function inventoryItems(session: PlaySession): InventoryItem[] {
  return session.store.getState().inventory.flatMap((entry) => {
    const itemId = typeof entry.itemId === 'string' ? entry.itemId : null;
    if (itemId === null) {
      return [];
    }
    const qty = typeof entry.qty === 'number' ? entry.qty : 1;
    const slot = typeof entry.slot === 'string' ? entry.slot : null;
    return [{ id: String(entry.id ?? itemId), itemId, qty, slot }];
  });
}

/** Panels that read the live store. The world frame stays in `App`. */
export function PlayPanels({ session }: { session: PlaySession }): ReactElement | null {
  if (session.screen === 'inventory') {
    return <InventoryScreen model={inventoryModel(inventoryItems(session), true)} />;
  }
  if (session.screen === 'craft') {
    const recipes = session.store.getState().recipes;
    return <CraftScreen recipes={recipes.length > 0 ? recipes : [{ id: 'rusty_sword' }]} />;
  }
  if (session.screen === 'quests') {
    const quests = session.store.getState().quests;
    return (
      <QuestScreen
        model={questModel(quests.length > 0 ? quests : [{ id: 'tutorial', objectives: [] }])}
      />
    );
  }
  if (session.screen === 'map') {
    const nodes = session.store.getState().mapNodes;
    const shown = nodes.length > 0 ? nodes : [{ id: 'fort_humans', kind: 'city' }];
    return <MapScreen model={mapModel(shown, shown.map((node) => node.id))} />;
  }
  if (session.screen === 'chat') {
    return (
      <section data-screen="chat">
        <ChatScreen channels={[{ id: 'local', input: true, stub: false, upy: true, partyLimit: null }]} />
        <ul>
          {session.store.getState().log.map((line, index) => (
            <li key={`${index}-${line}`}>{line}</li>
          ))}
        </ul>
      </section>
    );
  }
  if (session.screen === 'trade') {
    return (
      <TradeScreen
        model={tradeModel(
          { gold: session.store.getState().self?.gold ?? 0, items: [] },
          { gold: 0, items: [] },
        )}
      />
    );
  }
  if (session.screen === 'hack') {
    const hint = session.store.getState().hackPassword;
    const model = hackModel({
      kind: 'patrol',
      technique: 0,
      attemptsLeft: 3,
      bulls: null,
      hasDeck: true,
    });
    if (hint !== null && hint.length > 0) {
      return <HackScreen model={model} hint={hint} />;
    }
    return <HackScreen model={model} />;
  }
  if (session.screen === 'settings') {
    return <SettingsScreen model={settingsModel({ scale: 1, colorblind: 'none', locale: session.locale })} />;
  }
  return null;
}
