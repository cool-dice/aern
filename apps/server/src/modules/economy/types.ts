import type { GradeId } from '@rift/domain/items';

export type Result<T, E extends string = string> = { ok: true; value: T } | { ok: false; code: E };

export function ok<T>(value: T): Result<T, never> {
  return { ok: true, value };
}

export function err<E extends string>(code: E): Result<never, E> {
  return { ok: false, code };
}

export type CharacterSide = 'light' | 'dark';
export type NodeSide = CharacterSide | 'center';
export type GuildMode = 'stub' | 'live';
export type PortalNodeKind = 'city' | 'hub' | 'dungeon' | 'resource' | 'primordial' | 'barrier';

export interface EconomyItem {
  itemId: string;
  level: number;
  grade: GradeId;
  /** Unique gear and unique components. `sellToNpc` refuses these. */
  unique: boolean;
  durability: number;
  qty: number;
}

export interface EconomyCharacter {
  characterId: string;
  gold: number;
  side: CharacterSide;
  visited: string[];
  portalCooldownUntilMs: number;
  items: Record<string, EconomyItem>;
}

export interface PortalNode {
  nodeId: string;
  kind: PortalNodeKind;
  side: NodeSide;
  cityFee: number;
  /** Ignored while `guild === 'stub'`. */
  hostile: boolean;
}

export interface TradeOffer {
  gold: number;
  items: Record<string, number>;
}

export interface AuctionLot {
  id: string;
  sellerId: string;
  itemId: string;
  qty: number;
  startPrice: number;
  currentBid: number;
  bidderId: string | null;
  buyout: number | null;
  guildCity: boolean;
}

export interface TradeSession {
  tradeId: string;
  aId: string;
  bId: string;
  aOffer: TradeOffer | null;
  bOffer: TradeOffer | null;
  aAccept: boolean;
  bAccept: boolean;
}

export interface OfferTradeInput {
  characterId: string;
  counterpartyId: string;
  gold: number;
  items: Record<string, number>;
}

export interface EconomyService {
  sell(characterId: string, itemId: string): Promise<Result<{ gold: number }, string>>;
  repair(
    characterId: string,
    itemId: string,
  ): Promise<Result<{ gold: number; durability: number }, string>>;
  portal(
    characterId: string,
    toNodeId: string,
    nowMs: number,
  ): Promise<Result<{ cooldownUntilMs: number }, string>>;
  offerTrade(input: OfferTradeInput): Promise<Result<{ tradeId: string }, string>>;
  acceptTrade(tradeId: string, characterId: string): Promise<Result<'pending' | 'done', string>>;
  cancelTrade(tradeId: string, characterId: string): Promise<Result<'cleared', string>>;
  listAuction(): Result<AuctionLot[], never>;
  offerAuction(input: {
    sellerId: string;
    itemId: string;
    qty: number;
    startPrice: number;
    buyout: number | null;
    guildCity: boolean;
  }): Result<{ id: string }, string>;
  bidAuction(input: {
    lotId: string;
    bidderId: string;
    bid: number;
  }): Result<{ price: number; buyout: boolean }, string>;
}
