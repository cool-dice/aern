import { STARTER_GOLD } from '@rift/domain/economy';
import type {
  EconomyCharacter,
  EconomyItem,
  GuildMode,
  PortalNode,
  TradeOffer,
  TradeSession,
} from './types';

export interface EconomyRepository {
  getCharacter(characterId: string): EconomyCharacter | null;
  saveCharacter(character: EconomyCharacter): void;
  getNode(nodeId: string): PortalNode | null;
  saveNode(node: PortalNode): void;
  barrierDown(): boolean;
  setBarrierDown(down: boolean): void;
  /** `stub` forces portal hostile to false. */
  guild(): GuildMode;
  setGuild(mode: GuildMode): void;
  getTrade(tradeId: string): TradeSession | null;
  findTrade(characterId: string, counterpartyId: string): TradeSession | null;
  saveTrade(session: TradeSession): void;
  deleteTrade(tradeId: string): void;
}

export function newEconomyCharacter(input: {
  characterId: string;
  side: EconomyCharacter['side'];
  gold?: number;
  visited?: readonly string[];
  portalCooldownUntilMs?: number;
  items?: Record<string, EconomyItem>;
}): EconomyCharacter {
  return {
    characterId: input.characterId,
    side: input.side,
    gold: input.gold ?? STARTER_GOLD,
    visited: [...(input.visited ?? [])],
    portalCooldownUntilMs: input.portalCooldownUntilMs ?? 0,
    items: copyItems(input.items ?? {}),
  };
}

function copyItem(item: EconomyItem): EconomyItem {
  return { ...item };
}

function copyItems(items: Record<string, EconomyItem>): Record<string, EconomyItem> {
  const copy: Record<string, EconomyItem> = {};
  for (const [id, item] of Object.entries(items)) {
    copy[id] = copyItem(item);
  }
  return copy;
}

function copyCharacter(character: EconomyCharacter): EconomyCharacter {
  return {
    characterId: character.characterId,
    gold: character.gold,
    side: character.side,
    visited: [...character.visited],
    portalCooldownUntilMs: character.portalCooldownUntilMs,
    items: copyItems(character.items),
  };
}

function copyOffer(offer: TradeOffer): TradeOffer {
  return { gold: offer.gold, items: { ...offer.items } };
}

function copyTrade(session: TradeSession): TradeSession {
  return {
    tradeId: session.tradeId,
    aId: session.aId,
    bId: session.bId,
    aOffer: session.aOffer === null ? null : copyOffer(session.aOffer),
    bOffer: session.bOffer === null ? null : copyOffer(session.bOffer),
    aAccept: session.aAccept,
    bAccept: session.bAccept,
  };
}

function pairKey(left: string, right: string): string {
  return left < right ? `${left}\0${right}` : `${right}\0${left}`;
}

/** In-memory wallets, portal nodes, and open trades. No socket and no database. */
export function memoryEconomyRepository(): EconomyRepository {
  const characters = new Map<string, EconomyCharacter>();
  const nodes = new Map<string, PortalNode>();
  const trades = new Map<string, TradeSession>();
  const tradesByPair = new Map<string, string>();
  let barrier = false;
  let guild: GuildMode = 'stub';

  return {
    getCharacter(characterId) {
      const character = characters.get(characterId);
      return character === undefined ? null : copyCharacter(character);
    },
    saveCharacter(character) {
      characters.set(character.characterId, copyCharacter(character));
    },
    getNode(nodeId) {
      const node = nodes.get(nodeId);
      return node === undefined ? null : { ...node };
    },
    saveNode(node) {
      nodes.set(node.nodeId, { ...node });
    },
    barrierDown() {
      return barrier;
    },
    setBarrierDown(down) {
      barrier = down;
    },
    guild() {
      return guild;
    },
    setGuild(mode) {
      guild = mode;
    },
    getTrade(tradeId) {
      const session = trades.get(tradeId);
      return session === undefined ? null : copyTrade(session);
    },
    findTrade(characterId, counterpartyId) {
      const tradeId = tradesByPair.get(pairKey(characterId, counterpartyId));
      if (tradeId === undefined) {
        return null;
      }
      const session = trades.get(tradeId);
      return session === undefined ? null : copyTrade(session);
    },
    saveTrade(session) {
      trades.set(session.tradeId, copyTrade(session));
      tradesByPair.set(pairKey(session.aId, session.bId), session.tradeId);
    },
    deleteTrade(tradeId) {
      const session = trades.get(tradeId);
      if (session === undefined) {
        return;
      }
      trades.delete(tradeId);
      const key = pairKey(session.aId, session.bId);
      if (tradesByPair.get(key) === tradeId) {
        tradesByPair.delete(key);
      }
    },
  };
}
