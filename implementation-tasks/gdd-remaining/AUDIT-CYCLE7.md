# Independent audit, cycle 7

Date: 2026-10-08. Branch `cursor/implement-codebase-a579`. This file re-reads the production call chain (`main.ts` → `buildApp` → `compose`, HTTP `LIVE_ROUTES` / socket `bindGateway`, `runLive`, and `App.tsx`). Earlier "done" notes are not evidence.

**Verdict: NOT COMPLETE.** The cycle-6 seven are still called from that path. The nine items that were open now have a production call. Required rules in auction tax, storage, diplomacy, city services, mercenaries, node seizure, and guild war that are still only a domain function, a ledger, or a stored row the tick never reads, are listed under Still open.

## Cycle-6 seven, re-read

1. **A guild-owned city debits the crossing fee and the 10% service cut.** `tickOnce` calls `applyOwnedCityFees` → `ownedCrossingFee`. `portalTo` debits the traveler and calls `creditGuildBank` → `depositBank`. `creditService` calls `serviceCut` when the character stands in a won city. Verified: `applyOwnedCityFees`, `ownedCrossingFee`, `creditGuildBank`, `depositBank`, `serviceCut`, `creditService`, `portalTo`.

2. **A neutral asking a hostile city for a portal is refused by the live route.** `askPortal` calls `portalAccess` → `cityServiceAccess` → `askHostilePortal`. `POST /portal/ask` is a `LIVE_ROUTE`. `App.tsx` calls `askPortal`. Verified: `askHostilePortal`, `portalAccess`, `askPortal`.

3. **Resource nodes plant from the tick.** `compose` seeds `freshResourceNode`. `tickOnce` calls `tickResourceNodes` → `advanceResourceNode`. `NODE_PLANT_MS` is 60_000 and `NODE_DROP_MS` is 1_800_000. `advanceResourceNode` still leaves the chest on the node; the production seizure is the next item. Verified: `freshResourceNode`, `tickResourceNodes`, `advanceResourceNode`.

4. **Craft, talk, learn, defend, and pvp notes carry a subject.** `note` goes through `askedObjective` before `onObjective`. A bare note does not advance an unnamed objective. Verified: `note`, `askedObjective`.

5. **Grid `move()` outside combat spends OD.** `odCost` ignores `inCombat` and returns `STEP_OD_COST` or the run cost. `applyMove` calls `move`. A geography step uses `edgeLength` (`WorldEdge.length`) and `edgeStep`. Verified: `odCost`, `move`, `applyMove`, `edgeLength`, `edgeStep`.

6. **Boot restores guild membership from the guild table.** `hydrate` calls `restoreGuilds`, which calls `listGuilds` and writes `entity.guildId` from `memberIds`. Verified: `hydrate`, `restoreGuilds`, `listGuilds`.

7. **A later scene refuses when stored NPC reputation is too low.** `questRows` passes stored reputation into `branchScene`, then `reputationScene`. Verified: `branchScene`, `reputationScene`, `questRows`.

## Wired this cycle

1. **Auction 5% tax in a guild city is deposited with `creditGuildBank`.** `auctionBid` calls `sellerProceeds`, then `cityOwner` on the lot's `cityId` (or the bidder's `characterNode`). `cityOwner` reads a won row in live `captures`. A neutral city, or a lot whose city has no capture, sets `taxSink: 'void'` and does not credit a bank. The bid function does not read `guildCity` and does not call `creditTax`. Verified: `auctionBid`, `sellerProceeds`, `cityOwner`, `creditGuildBank`, `auctionLot`.

2. **Extended storage is 1 gold per day per slot.** `STORAGE_GOLD_PER_SLOT_DAY` is 1. `rentStorage` multiplies slots by days. `POST /storage` calls `rentCityStorage`, which debits the wallet and, when `cityOwner` is set, calls `creditGuildBank`. `App.tsx` calls `rentStorage`. Verified: `rentStorage`, `rentCityStorage`, `creditGuildBank`.

3. **Alliances, coalitions, vassals, and non-aggression pacts are stored.** `POST /pact` calls `formPact`. `portalStance` returns `ally` when `pactAlly` finds a live pact, so the ally branch of `askHostilePortal` is reachable. `allianceFriendlyFire` is only the alliance kind and is applied in `guardAllies`. A NAP attack calls `breachNap` → `breachNonAggression` (50_000 gold, flag `NAP_FLAG_MS`). `coalitionBank` is called from `formPact` and always fails, so a coalition is not given a bank. Verified: `formPact`, `pactAlly`, `pactLive`, `portalStance`, `askHostilePortal`, `allianceFriendlyFire`, `guardAllies`, `napBetween`, `breachNonAggression`, `coalitionBank`.

4. **The same stance check gates storage, the library, the bind point, the auction, and repair.** `cityServiceAccess` calls `askHostilePortal` for every `CITY_SERVICES` entry. `rentCityStorage`, `useLibrary`, `bindCity`, `auctionBid`, and `repair` call `cityService`. A neutral without a grant or a pact gets `refused`. An enemy gets `blocked`. An ally gets `enter`. Verified: `cityServiceAccess`, `askHostilePortal`, `cityService`, `isCityService`.

5. **Mercenary contracts and intra-guild patrol quests have a tick and a live route.** `POST /mercenary` calls `postMercenary` (leader or council, mercenary is not a member, kinds patrol/defend/attack/escort, reward must fit the bank). `POST /patrol` calls `postPatrolQuest` (assignee must be a member; omitted duration and reward are `PATROL_QUEST_MS` 3 hours and `PATROL_QUEST_GOLD` 5_000). `tickOnce` and `skipMs` call `tickContracts` → `tickContract`. Presence for the duration pays the reward from the guild bank to the wallet. A deadline without presence, or a bank that can no longer cover the reward, fails and pays nothing. `App.tsx` calls `postMercenary` and `postPatrol`. Verified: `postMercenary`, `postPatrolQuest`, `tickContract`, `tickContracts`.

6. **A dropped resource-node flag seizes the chest, and the officer tax cap is 15%.** `tickResourceNodes` calls `advanceResourceNode` then `settleNodeDrop`. On a drop, the guild that held the flag receives the chest and the node chest becomes 0. `applyNodeSeizure` stores that amount with `depositNodeChest` on `guildVaults`. `setNodeTax` caps `officer` at `NODE_TAX_OFFICER_MAX` (15). `leader` and `council` stay 0–`NODE_TAX_MAX` (30). `veteran` and `novice` return `rank`. `POST /node/tax` requires `characterId` and passes `memberRank` into `setNodeTax`. A non-officer cannot set the tax. Verified: `settleNodeDrop`, `tickResourceNodes`, `applyNodeSeizure`, `depositNodeChest`, `setNodeTax`, `setResourceTax`, `memberRank`.

7. **`GuildService.declareWar` and `GuildService.withdraw` are live routes.** `POST /war` calls `vassalMayDeclare` then `guild.declareWar` (`WAR_GOLD` 50_000, `WAR_RESOURCES` 20_000, `WAR_LEAD_MS` 48 hours). `POST /guild/withdraw` calls `guild.withdraw` with the stored rank when `characterId` is present. `App.tsx` calls `declareWar` and `withdrawBank`. Verified: `declareWar`, `withdraw`, `vassalMayDeclare`, `guildWar`, `guildWithdraw`.

8. **The play session posts the city and node routes and keeps the snapshot rows.** `App.tsx` calls `setCityFee` (`/city-fee`), `setNodeTax` (`/node/tax`), `setNodeAccess` (`/node/access`), and `grantNode` (`/node/grant`). `postService` writes `serviceResult` and does not clear `captures` or `resourceNodes`. `statePayload` still includes both. Verified: `setCityFee`, `setNodeTax`, `setNodeAccess`, `grantNode`, `postService`, `statePayload`.

9. **The 30-minute node drop and the 24-hour portal lift are clock skips, not 864_000 ticks.** `skipMs` advances `manualClock` and passes that `deltaMs` into `tickResourceNodes` and `tickCaptures`. The node test skips `NODE_DROP_MS` (1_800_000). The portal test skips `PORTAL_BLOCK_MS` (86_400_000). The thresholds are the domain constants. Verified: `skipMs`, `manualClock`, `NODE_DROP_MS`, `PORTAL_BLOCK_MS`.

Also wired while reading those paths:

- **Alliance notice, renewal, and vassal release.** `POST /pact/notice` calls `noticeAllianceBreak` or `noticeVassalRelease`. `pactLive` ends an alliance `ALLIANCE_BREAK_MS` (24 hours) after the notice and a vassal `VASSAL_RELEASE_MS` (7 days) after the notice. `POST /pact/renew` calls `renewPact` for an alliance or a non-aggression pact (`PACT_MS`, 7 days). `skipMs` calls `tickVassalTithes` → `titheDays` and `applyVassalTithe` (10–30% of the vassal bank per day) and `creditGuildBank` for the suzerain. `App.tsx` calls `noticePact` and `renewPact`. Verified: `noticeAllianceBreak`, `noticeVassalRelease`, `renewPact`, `pactLive`, `applyVassalTithe`, `titheDays`, `tickVassalTithes`.

- **War contenders.** `POST /war/contend` calls `registerContender` (`CONTENDER_GOLD` 10_000, refused when `nowMs` is inside `CONTENDER_CLOSE_MS` of `startsAtMs`). The route requires leader or council and debits the guild bank. The row is kept on `contenders` and on the snapshot. `App.tsx` calls `registerContender`. Verified: `registerContender`, `registerWarContender`.

## Still open

- Neutral-city capture (artifact 17 §6) is not implemented. There is no 25_000 gold intent, no 48-hour public event, and no guard fight before the hold. `declareWar` always charges 50_000 gold and 20_000 resources.
- `warWinner` and `settleWar` are not called from `compose` or `dispatch`. `tickCaptures` uses `advanceHold` and `holdWins` only, so a 10-minute stand wins during muster. A draw, "the only guild still fighting", and the 3-day draw cooldown are not applied on the tick.
- Contender rows do not gate the capture. `tickCaptures` never reads `contenders`. A mercenary or a solo player is not barred from taking the city.
- Alliance break is the 24-hour fuse in `pactLive`. There is no later break action that stays unavailable until the notice has aged while the alliance itself continues.
- A suzerain is not required to defend a vassal. Ally map markers are not drawn. A coalition has no diplomatic channel.
- Resource-node access is one value, `open` / `request` / `closed`. `resourceAccess` does not call `portalStance` or `pactAlly`, so allies, other guilds, and neutrals are not separate categories.
- `advanceResourceNode` still leaves the chest on the node. Artifact 17 §8.4 says that chest stays until the next planter. The live tick seizes it in `settleNodeDrop` because this cycle required the chest not to remain on the node.
- `EconomyService.creditTax` and `auctionTaxSink(lot.guildCity)` still classify the ledger. The live bid does not call them. A stored `guildCity` flag without a capture does not deposit the tax.
- Mercenary kind does not change the outcome. `tickContract` completes on presence for `durationMs` for patrol, defend, attack, and escort alike.
- `tickOnce` calls `tickContracts` and `tickVassalTithes` without awaiting them. `skipMs` awaits both.
- War death (defenders revive at the city bind, attackers at the muster hub) is not a branch on `respawn`. `respawnAtBind` is the ordinary death rule.
- No Steam listing and no trained GPU weight file. Those were not required.
- The GDD is not complete.
