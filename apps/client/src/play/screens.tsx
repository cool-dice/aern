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

/** Panels that read the live store. Craft and trade buttons post the live HTTP routes. */
export function PlayPanels({
  session,
  onCraft,
  onTrade,
  onPortal,
  onPortalAsk,
  onDungeon,
  onDungeonSolo,
  onCityFee,
  onNodeTax,
  onNodeAccess,
  onNodeGrant,
  onStorage,
  onWar,
  onWithdraw,
  onDoctrine,
  onBankLog,
  onContract,
  onAncientEncode,
  onAncientDecipher,
  onMercenary,
  onPatrol,
  onGuildQuest,
  onPactNotice,
  onPactBreak,
  onPactRenew,
  onContend,
  onCoalition,
  onCoalitionDeposit,
  onCoalitionRead,
  onPurify,
  onRemoveRelic,
  onMatchmake,
  onVote,
  onChoice,
  onEmblem,
  onDissolve,
  onStrike,
}: {
  session: PlaySession;
  onCraft?: () => void;
  onTrade?: () => void;
  onPortal?: () => void;
  onPortalAsk?: () => void;
  onDungeon?: () => void;
  onDungeonSolo?: () => void;
  onCityFee?: () => void;
  onNodeTax?: () => void;
  onNodeAccess?: () => void;
  onNodeGrant?: () => void;
  onStorage?: () => void;
  onWar?: () => void;
  onWithdraw?: () => void;
  onDoctrine?: () => void;
  onBankLog?: () => void;
  onContract?: () => void;
  onAncientEncode?: () => void;
  onAncientDecipher?: () => void;
  onMercenary?: () => void;
  onPatrol?: () => void;
  onGuildQuest?: () => void;
  onPactNotice?: () => void;
  onPactBreak?: () => void;
  onPactRenew?: () => void;
  onContend?: () => void;
  onCoalition?: () => void;
  onCoalitionDeposit?: () => void;
  onCoalitionRead?: () => void;
  onPurify?: () => void;
  onRemoveRelic?: () => void;
  onMatchmake?: () => void;
  onVote?: () => void;
  onChoice?: () => void;
  onEmblem?: () => void;
  onDissolve?: () => void;
  onStrike?: () => void;
}): ReactElement | null {
  if (session.screen === 'inventory') {
    return <InventoryScreen model={inventoryModel(inventoryItems(session), true)} />;
  }
  if (session.screen === 'craft') {
    const recipes = session.store.getState().recipes;
    const jobId = session.store.getState().craftJob?.jobId;
    return (
      <section>
        <CraftScreen recipes={recipes.length > 0 ? recipes : [{ id: 'rusty_sword' }]} />
        <button type="button" data-craft="start" onClick={() => onCraft?.()}>
          start
        </button>
        {typeof jobId === 'string' ? <p data-craft-job={jobId}>{jobId}</p> : null}
      </section>
    );
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
    const state = session.store.getState();
    const nodes = state.mapNodes;
    const shown = nodes.length > 0 ? nodes : [{ id: 'fort_humans', kind: 'city' }];
    const portalNode = typeof state.portalResult?.nodeId === 'string' ? state.portalResult.nodeId : '';
    const instanceId = typeof state.dungeonResult?.instanceId === 'string' ? state.dungeonResult.instanceId : '';
    const hold = state.captures[0];
    return (
      <section>
        <MapScreen model={mapModel(shown, shown.map((node) => node.id), state.allies)} />
        <button type="button" data-portal="start" onClick={() => onPortal?.()}>
          portal
        </button>
        <button type="button" data-portal="ask" onClick={() => onPortalAsk?.()}>
          ask
        </button>
        <button type="button" data-dungeon="share" onClick={() => onDungeon?.()}>
          share
        </button>
        <button type="button" data-dungeon="solo" onClick={() => onDungeonSolo?.()}>
          solo
        </button>
        {portalNode.length > 0 ? <p data-portal-node={portalNode}>{portalNode}</p> : null}
        {instanceId.length > 0 ? <p data-dungeon-instance={instanceId}>{instanceId}</p> : null}
        {hold !== undefined ? (
          <p data-capture={hold.cityId}>
            {hold.guildId ?? ''}:{String(hold.heldMs)}
          </p>
        ) : null}
        {state.resourceNodes[0] !== undefined ? (
          <p data-resource-node={state.resourceNodes[0].nodeId}>
            {state.resourceNodes[0].guildId ?? ''}:{String(state.resourceNodes[0].plantMs)}
          </p>
        ) : null}
        <button type="button" data-city-fee="set" onClick={() => onCityFee?.()}>
          fee
        </button>
        <button type="button" data-node-tax="set" onClick={() => onNodeTax?.()}>
          tax
        </button>
        <button type="button" data-node-access="set" onClick={() => onNodeAccess?.()}>
          access
        </button>
        <button type="button" data-node-grant="set" onClick={() => onNodeGrant?.()}>
          grant
        </button>
        <button type="button" data-storage="rent" onClick={() => onStorage?.()}>
          storage
        </button>
        <button type="button" data-war="declare" onClick={() => onWar?.()}>
          war
        </button>
        <button type="button" data-withdraw="bank" onClick={() => onWithdraw?.()}>
          withdraw
        </button>
        <button type="button" data-doctrine="set" onClick={() => onDoctrine?.()}>
          doctrine
        </button>
        <button type="button" data-bank="log" onClick={() => onBankLog?.()}>
          bank
        </button>
        <button type="button" data-contract="post" onClick={() => onContract?.()}>
          contract
        </button>
        <button type="button" data-ancient="encode" onClick={() => onAncientEncode?.()}>
          encode
        </button>
        <button type="button" data-ancient="decipher" onClick={() => onAncientDecipher?.()}>
          decipher
        </button>
        <button type="button" data-mercenary="post" onClick={() => onMercenary?.()}>
          mercenary
        </button>
        <button type="button" data-patrol="post" onClick={() => onPatrol?.()}>
          patrol
        </button>
        <button type="button" data-guild-quest="post" onClick={() => onGuildQuest?.()}>
          quest
        </button>
        <button type="button" data-pact="notice" onClick={() => onPactNotice?.()}>
          notice
        </button>
        <button type="button" data-pact="break" onClick={() => onPactBreak?.()}>
          break
        </button>
        <button type="button" data-pact="renew" onClick={() => onPactRenew?.()}>
          renew
        </button>
        <button type="button" data-war="contend" onClick={() => onContend?.()}>
          contend
        </button>
        <button type="button" data-coalition="say" onClick={() => onCoalition?.()}>
          coalition
        </button>
        <button type="button" data-coalition="deposit" onClick={() => onCoalitionDeposit?.()}>
          deposit
        </button>
        <button type="button" data-coalition="read" onClick={() => onCoalitionRead?.()}>
          read
        </button>
        <button type="button" data-party="match" onClick={() => onMatchmake?.()}>
          group
        </button>
        <button type="button" data-relic="remove" onClick={() => onRemoveRelic?.()}>
          unslot
        </button>
        <button type="button" data-purify="begin" onClick={() => onPurify?.()}>
          purify
        </button>
        <button type="button" data-vote="leader" onClick={() => onVote?.()}>
          vote
        </button>
        <button type="button" data-vote="choice" onClick={() => onChoice?.()}>
          choice
        </button>
        <button type="button" data-emblem="set" onClick={() => onEmblem?.()}>
          emblem
        </button>
        <button type="button" data-dissolve="guild" onClick={() => onDissolve?.()}>
          dissolve
        </button>
        <button type="button" data-node-strike="chest" onClick={() => onStrike?.()}>
          strike
        </button>
        {typeof state.serviceResult?.route === 'string' ? (
          <p data-service-route={state.serviceResult.route}>{state.serviceResult.route}</p>
        ) : null}
      </section>
    );
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
    const status = session.store.getState().tradeResult?.accept;
    const tradeStatus =
      typeof status === 'object' && status !== null && 'status' in status
        ? String((status as { status?: unknown }).status ?? '')
        : '';
    return (
      <section>
        <TradeScreen
          model={tradeModel(
            { gold: session.store.getState().self?.gold ?? 0, items: [] },
            { gold: 0, items: [] },
          )}
        />
        <button type="button" data-trade="accept" onClick={() => onTrade?.()}>
          trade
        </button>
        {tradeStatus.length > 0 ? <p data-trade-status={tradeStatus}>{tradeStatus}</p> : null}
      </section>
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
