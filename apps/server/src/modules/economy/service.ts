import { randomUUID } from 'node:crypto';
import {
  deposit,
  placeBid,
  portalFee,
  repairCost,
  sellerProceeds,
  sellToNpc,
  trade,
} from '@rift/domain/economy';
import { STARTING_DURABILITY } from '@rift/domain/items';
import type { EconomyRepository } from './repository';
import {
  err,
  ok,
  type EconomyCharacter,
  type EconomyItem,
  type EconomyService,
  type OfferTradeInput,
  type Result,
  type TradeOffer,
  type TradeSession,
} from './types';

export function createEconomyService(repository: EconomyRepository): EconomyService {
  const tax = { guild: 0, void: 0 };
  return {
    async sell(characterId, itemId) {
      const character = repository.getCharacter(characterId);
      if (character === null) {
        return err('missing');
      }
      const item = character.items[itemId];
      if (item === undefined || item.qty <= 0) {
        return err('missing');
      }
      const price = sellToNpc(item.level, item.grade, item.unique);
      if (!price.ok) {
        return err(price.code);
      }
      const credited = deposit(character.gold, price.value);
      const items = { ...character.items };
      if (item.qty === 1) {
        delete items[itemId];
      } else {
        items[itemId] = { ...item, qty: item.qty - 1 };
      }
      const next: EconomyCharacter = { ...character, gold: credited.wallet, items };
      repository.saveCharacter(next);
      return ok({ gold: next.gold });
    },

    async repair(characterId, itemId) {
      const character = repository.getCharacter(characterId);
      if (character === null) {
        return err('missing');
      }
      const item = character.items[itemId];
      if (item === undefined || item.qty <= 0) {
        return err('missing');
      }
      const cost = repairCost(item.level, item.grade, item.durability);
      if (!cost.ok) {
        return err(cost.code);
      }
      if (character.gold < cost.value) {
        return err('gold');
      }
      const items = {
        ...character.items,
        [itemId]: { ...item, durability: STARTING_DURABILITY },
      };
      const next: EconomyCharacter = {
        ...character,
        gold: character.gold - cost.value,
        items,
      };
      repository.saveCharacter(next);
      return ok({ gold: next.gold, durability: STARTING_DURABILITY });
    },

    async portal(characterId, toNodeId, nowMs) {
      if (!Number.isInteger(nowMs)) {
        return err('invalid');
      }
      const character = repository.getCharacter(characterId);
      if (character === null) {
        return err('missing');
      }
      const node = repository.getNode(toNodeId);
      if (node === null || node.kind !== 'city') {
        return err('unknown');
      }
      const quote = portalFee({
        sameSide: character.side === node.side,
        barrierDown: repository.barrierDown(),
        cityFee: node.cityFee,
        visited: character.visited.includes(node.nodeId),
        hostile: repository.guild() === 'stub' ? false : node.hostile,
      });
      if (!quote.ok) {
        return err(quote.code);
      }
      if (nowMs < character.portalCooldownUntilMs) {
        return err('cooldown');
      }
      if (character.gold < quote.value.gold) {
        return err('gold');
      }
      const cooldownUntilMs = nowMs + quote.value.cooldownMs;
      repository.saveCharacter({
        ...character,
        gold: character.gold - quote.value.gold,
        portalCooldownUntilMs: cooldownUntilMs,
      });
      return ok({ cooldownUntilMs });
    },

    async offerTrade(input) {
      const validated = validateOffer(input);
      if (!validated.ok) {
        return err(validated.code);
      }
      if (input.characterId === input.counterpartyId) {
        return err('self');
      }
      const self = repository.getCharacter(input.characterId);
      const other = repository.getCharacter(input.counterpartyId);
      if (self === null || other === null) {
        return err('missing');
      }
      const existing = repository.findTrade(input.characterId, input.counterpartyId);
      if (existing === null) {
        const session: TradeSession = {
          tradeId: randomUUID(),
          aId: input.characterId,
          bId: input.counterpartyId,
          aOffer: validated.value,
          bOffer: null,
          aAccept: false,
          bAccept: false,
        };
        repository.saveTrade(session);
        return ok({ tradeId: session.tradeId });
      }
      const session = existing;
      if (input.characterId === session.aId) {
        session.aOffer = validated.value;
      } else if (input.characterId === session.bId) {
        session.bOffer = validated.value;
      } else {
        return err('missing');
      }
      session.aAccept = false;
      session.bAccept = false;
      repository.saveTrade(session);
      return ok({ tradeId: session.tradeId });
    },

    async acceptTrade(tradeId, characterId) {
      const session = repository.getTrade(tradeId);
      if (session === null) {
        return err('missing');
      }
      if (characterId === session.aId) {
        session.aAccept = true;
      } else if (characterId === session.bId) {
        session.bAccept = true;
      } else {
        return err('missing');
      }
      repository.saveTrade(session);
      if (
        session.aOffer === null ||
        session.bOffer === null ||
        !session.aAccept ||
        !session.bAccept
      ) {
        return ok('pending');
      }
      const settled = settleTrade(repository, session, session.aOffer, session.bOffer);
      if (!settled.ok) {
        return err(settled.code);
      }
      return ok('done');
    },

    async cancelTrade(tradeId, characterId) {
      const session = repository.getTrade(tradeId);
      if (session === null) {
        return err('missing');
      }
      if (characterId === session.aId) {
        session.aOffer = null;
      } else if (characterId === session.bId) {
        session.bOffer = null;
      } else {
        return err('missing');
      }
      session.aAccept = false;
      session.bAccept = false;
      if (session.aOffer === null && session.bOffer === null) {
        repository.deleteTrade(session.tradeId);
      } else {
        repository.saveTrade(session);
      }
      return ok('cleared');
    },

    listAuction() {
      return ok(repository.listLots());
    },

    offerAuction(input) {
      if (!Number.isInteger(input.qty) || input.qty < 1) {
        return err('items');
      }
      if (!Number.isInteger(input.startPrice) || input.startPrice < 1) {
        return err('gold');
      }
      const seller = repository.getCharacter(input.sellerId);
      if (seller === null) {
        return err('missing');
      }
      const stack = seller.items[input.itemId];
      if (stack === undefined || stack.qty < input.qty) {
        return err('items');
      }
      const next = copyCharacter(seller);
      const left = stack.qty - input.qty;
      if (left === 0) {
        delete next.items[input.itemId];
      } else {
        next.items[input.itemId] = { ...stack, qty: left };
      }
      repository.saveCharacter(next);
      const id = randomUUID();
      repository.saveLot({
        id,
        sellerId: input.sellerId,
        itemId: input.itemId,
        qty: input.qty,
        startPrice: input.startPrice,
        currentBid: 0,
        bidderId: null,
        buyout: input.buyout,
        guildCity: input.guildCity,
        cityId: input.cityId ?? null,
      });
      return ok({ id });
    },

    bidAuction(input) {
      const lot = repository.getLot(input.lotId);
      const bidder = repository.getCharacter(input.bidderId);
      if (lot === null || bidder === null) {
        return err('missing');
      }
      if (lot.sellerId === input.bidderId) {
        return err('self');
      }
      const placed = placeBid({
        startPrice: lot.startPrice,
        currentBid: lot.currentBid,
        bid: input.bid,
        buyout: lot.buyout,
      });
      if (!placed.ok) {
        return err(placed.code);
      }
      const already = lot.bidderId === input.bidderId ? lot.currentBid : 0;
      if (bidder.gold + already < placed.value.price) {
        return err('gold');
      }
      if (lot.bidderId !== null && lot.bidderId !== input.bidderId && lot.currentBid > 0) {
        const previous = repository.getCharacter(lot.bidderId);
        if (previous !== null) {
          const refunded = copyCharacter(previous);
          refunded.gold += lot.currentBid;
          repository.saveCharacter(refunded);
        }
      }
      const buyer = copyCharacter(bidder);
      buyer.gold = bidder.gold + already - placed.value.price;
      if (!placed.value.buyout) {
        repository.saveCharacter(buyer);
        repository.saveLot({
          ...lot,
          currentBid: placed.value.price,
          bidderId: input.bidderId,
        });
        return ok({ price: placed.value.price, buyout: false });
      }
      const seller = repository.getCharacter(lot.sellerId);
      if (seller === null) {
        return err('missing');
      }
      const paid = sellerProceeds(placed.value.price);
      const nextSeller = copyCharacter(seller);
      nextSeller.gold += paid.seller;
      const stack = buyer.items[lot.itemId];
      buyer.items[lot.itemId] = stack
        ? { ...stack, qty: stack.qty + lot.qty }
        : {
            itemId: lot.itemId,
            level: 1,
            grade: 'common',
            unique: false,
            durability: 100,
            qty: lot.qty,
          };
      repository.saveCharacter(buyer);
      repository.saveCharacter(nextSeller);
      repository.deleteLot(lot.id);
      return ok({ price: placed.value.price, buyout: true });
    },

    auctionLot(lotId) {
      return repository.getLot(lotId);
    },

    taxLedger() {
      return { guild: tax.guild, void: tax.void };
    },

    balance(characterId) {
      return repository.getCharacter(characterId)?.gold ?? null;
    },
  };
}

function validateOffer(input: OfferTradeInput): Result<TradeOffer, string> {
  if (!Number.isInteger(input.gold) || input.gold < 0) {
    return err('gold');
  }
  const items: Record<string, number> = {};
  for (const [itemId, qty] of Object.entries(input.items)) {
    if (!Number.isInteger(qty) || qty < 0) {
      return err('items');
    }
    if (qty > 0) {
      items[itemId] = qty;
    }
  }
  return ok({ gold: input.gold, items });
}

function settleTrade(
  repository: EconomyRepository,
  session: TradeSession,
  aOffer: TradeOffer,
  bOffer: TradeOffer,
): Result<true, string> {
  const a = repository.getCharacter(session.aId);
  const b = repository.getCharacter(session.bId);
  if (a === null || b === null) {
    return err('missing');
  }
  const moved = trade({
    aGold: a.gold,
    bGold: b.gold,
    aOfferGold: aOffer.gold,
    bOfferGold: bOffer.gold,
    aStacks: stackMap(a.items),
    bStacks: stackMap(b.items),
    aOffer: aOffer.items,
    bOffer: bOffer.items,
    aAccept: true,
    bAccept: true,
  });
  if (!moved.ok) {
    return err(moved.code);
  }
  const nextA = copyCharacter(a);
  const nextB = copyCharacter(b);
  nextA.gold = applyGold(a.gold, aOffer.gold, bOffer.gold);
  nextB.gold = applyGold(b.gold, bOffer.gold, aOffer.gold);
  moveOffer(nextA.items, nextB.items, aOffer.items);
  moveOffer(nextB.items, nextA.items, bOffer.items);
  if (
    !sameStacks(stackMap(nextA.items), moved.value.aStacks) ||
    !sameStacks(stackMap(nextB.items), moved.value.bStacks)
  ) {
    throw new Error('trade items diverged from the domain result');
  }
  repository.saveCharacter(nextA);
  repository.saveCharacter(nextB);
  repository.deleteTrade(session.tradeId);
  return ok(true);
}

function applyGold(wallet: number, paid: number, received: number): number {
  return deposit(wallet - paid, received).wallet;
}

function stackMap(items: Record<string, EconomyItem>): Record<string, number> {
  const stacks: Record<string, number> = {};
  for (const [id, item] of Object.entries(items)) {
    if (item.qty > 0) {
      stacks[id] = item.qty;
    }
  }
  return stacks;
}

function moveOffer(
  from: Record<string, EconomyItem>,
  to: Record<string, EconomyItem>,
  offer: Record<string, number>,
): void {
  for (const [id, qty] of Object.entries(offer)) {
    if (qty === 0) {
      continue;
    }
    const stack = from[id];
    if (stack === undefined || stack.qty < qty) {
      throw new Error(`stack ${id} diverged from the domain trade`);
    }
    const left = stack.qty - qty;
    if (left === 0) {
      delete from[id];
    } else {
      from[id] = { ...stack, qty: left };
    }
    const dest = to[id];
    if (dest === undefined) {
      to[id] = { ...stack, qty };
    } else {
      to[id] = { ...dest, qty: dest.qty + qty };
    }
  }
}

function sameStacks(left: Record<string, number>, right: Record<string, number>): boolean {
  const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
  for (const key of keys) {
    if ((left[key] ?? 0) !== (right[key] ?? 0)) {
      return false;
    }
  }
  return true;
}

function copyCharacter(character: EconomyCharacter): EconomyCharacter {
  const items: Record<string, EconomyItem> = {};
  for (const [id, item] of Object.entries(character.items)) {
    items[id] = { ...item };
  }
  return {
    ...character,
    visited: [...character.visited],
    items,
  };
}
