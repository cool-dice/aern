# Independent audit, cycle 6

Date: 2026-10-08. Branch `cursor/implement-codebase-a579`. This file re-reads the production call chain (`main.ts` → `buildApp` → `compose`, HTTP `LIVE_ROUTES` / socket `bindGateway`, `runLive`, and `App.tsx`). Earlier "done" notes are not evidence.

**Verdict: NOT COMPLETE.** The cycle-5 six are still called from that path. The seven items that were open are now called from that path as well. Required rules in those same systems that are still only a ledger, a service method with no live route, or a domain check the play session never reaches, are listed under Still open.

## Cycle-5 six, re-read

1. **A quest event matches only the objective that asked for that subject.** `reportKind` calls `askedObjective` before `onObjective`. `note` calls `applyLife` and `reportKind`. Verified: `askedObjective`, `reportKind`, `note`.

2. **NPC reputation is stored per character and NPC.** Dialogue calls `shiftReputation`. `choiceReputation` and `nextReputation` feed `bumpReputation`. `quest.completed` and `quest.failed` shift the same map. The snapshot includes `reputation`. Verified: `choiceReputation`, `nextReputation`, `bumpReputation`, `shiftReputation`.

3. **A geography step spends OD and travel time from `WorldEdge.length`.** `stepNode` calls `edgeLength`. `walkEdge` calls `edgeStep`. Verified: `edgeLength`, `edgeStep`, `walkEdge`, `stepNode`.

4. **`advanceHold` / `holdWins` run while one guild holds the city, and the client can read that capture.** `tickOnce` calls `tickCaptures`. `statePayload` includes `captures`. The client `applySnapshot` stores them. Verified: `tickCaptures`, `advanceHold`, `holdWins`, `applySnapshot`.

5. **Portal price/cooldown and shared-seed dungeon entry are live routes the play session posts.** `POST /portal` calls `portalTo` (`portalFee` / `canPortal`). `POST /dungeon` calls `DungeonService.enter` (`seedFor`). `App.tsx` calls `startPortal` and `enterDungeon`. Verified: `portalTo`, `portalFee`, `enter`, `seedFor`, `startPortal`, `enterDungeon`.

## Wired this cycle

1. **A guild-owned city charges the crossing fee and the service cut.** After `holdWins`, `tickOnce` calls `applyOwnedCityFees`, which calls `ownedCrossingFee`. A stored `0` becomes `CITY_FEE_MIN` (1). `setCityFee` rejects 0 and 6 and keeps 1–5. `portalTo` debits the traveler (`portalFee` includes `cityFee`) and calls `creditGuildBank` → `depositBank` for the crossing portion only. `creditService` calls `serviceCut` (10%) when the character's `nodeId` is a won city, and repair/craft rush return that cut. `POST /city-fee`, `POST /repair`, and `POST /portal` are `LIVE_ROUTES`. `App.tsx` posts `/portal` through `startPortal`. Verified: `applyOwnedCityFees`, `ownedCrossingFee`, `setCityFee`, `creditGuildBank`, `depositBank`, `serviceCut`, `creditService`, `portalTo`, `startPortal`.

2. **A neutral asking a hostile city for a portal is a real route.** `portalTo` and `askPortal` call `portalAccess`, which calls `askHostilePortal`. `portalStance` returns `member` (same guild), `enemy` (any other guild), or `neutral` (no guild). A neutral gets `refused` until `grantPortal` or the 24-hour lift (`PORTAL_BLOCK_MS`, `blockedForMs` from `wonAtMs`, and `warPhase`). An enemy gets `blocked`. `POST /portal/ask` and `POST /portal/grant` are `LIVE_ROUTES`. `App.tsx` calls `askPortal` (`data-portal="ask"`). Verified: `askHostilePortal`, `portalAccess`, `portalStance`, `askPortal`, `grantPortal`.

3. **Resource-node capture is planted from the tick and the client can see it.** `compose` seeds `freshResourceNode` for geography `kind === 'resource'`. `tickOnce` calls `tickResourceNodes`, which calls `advanceResourceNode` (`NODE_PLANT_MS` 60_000, `NODE_DROP_MS` 1_800_000). The chest stays when the flag drops. Gather calls `resourceTax` and `addNodeChest` → `depositNodeChest`. `setNodeTax` enforces 0–30 and `NODE_TAX_COOLDOWN_MS`. `setNodeAccess` accepts `open` / `request` / `closed`. `statePayload` includes `resourceNodes`. The client `applySnapshot` stores them and the map renders `data-resource-node`. Verified: `freshResourceNode`, `tickResourceNodes`, `advanceResourceNode`, `resourceTax`, `addNodeChest`, `depositNodeChest`, `setNodeTax`, `setNodeAccess`, `applySnapshot`.

4. **`build.installed`, `chat.message`, and `combat.hit` notes carry a subject.** Build emits `subtype` / `templateId`. Chat emits `subject` only when `say` has `npcId`. `tickOnce` emits `combat.hit` with `subject` (monster id, else the target id) and `playerAttacker` when the attacker is not a monster, including a killing blow after the victim is removed. The listeners return when `subject` is missing, then `note` `craft`, `learn`, `talk`, `defend`, and (`playerAttacker`) `pvp`. An unnamed objective does not advance from a bare note. Verified: `note`, `askedObjective`.

5. **Grid `move()` outside combat spends OD.** `odCost` charges `STEP_OD_COST` (1) or `paceFor().runOdCost` (3) and does not return 0 when `inCombat` is false. `applyMove` calls `move` for a grid step. A geography step still goes through `stepNode` → `edgeLength` / `edgeStep`, not that grid `move`. Verified: `odCost`, `move`, `applyMove`, `edgeLength`, `edgeStep`.

6. **Boot restores guild membership from the guild table.** `hydrate` calls `restoreGuilds` after the rift-sim snapshot is loaded. `restoreGuilds` calls `repos.guilds.listGuilds()`, rebuilds `guildOf` from `memberIds`, and sets or deletes `entity.guildId` from that table. A snapshot `guildId` does not win. `tickCaptures` reads the restored `guildId`. Verified: `hydrate`, `restoreGuilds`, `listGuilds`, `tickCaptures`.

7. **A later scene reads stored reputation.** `questRows` passes `entity.reputation?.[objective.id]` into `branchScene`. When that number is defined, the objective id is in the gated set (`koval`, `mechanic`, `orden`, `archivist`, `watcher`, `archivists`, `ash_keepers`, `archive`), and `reputationTier(reputation).quests === 'none'` (≤20), `branchScene` returns the scene plus `Refused: reputation is too low for this quest.` and does not apply the choice line. Omitting the number keeps the catalog or choice line. `reputationScene` does not append a second refusal when the scene already contains `Refused:`. Verified: `branchScene`, `reputationTier`, `reputationScene`, `questRows`.

## Still open

- Auction tax is classified, not paid to a guild bank. `auctionTaxSink` and `taxLedger` split 5% into `guild` or `void` from the lot's `guildCity` boolean. Nothing calls `creditGuildBank` with that tax, and the boolean is not read from `captures`.
- Extended storage (1 gold per day per slot into the guild bank) has no function and no route.
- Portal stance never returns `ally`. There is no alliance, coalition, vassal, or non-aggression store, so the ally branch of `askHostilePortal` is unreachable. Friendly fire between allies is not a rule on the tick.
- `askHostilePortal` gates the portal. Storage, the library, the bind point, the auction, and repair are not the same stance check. `creditService` only looks at whether the character is standing in a won city.
- Mercenary contracts and intra-guild patrol quests have no domain function on the tick and no live route.
- `advanceResourceNode` keeps the chest on the node when the flag drops. There is no separate seizure that moves the chest to the guild that takes the flag. `setNodeTax` allows 0–30 for whoever calls `/node/tax`; the officer cap of 0–15% is not applied.
- `GuildService.declareWar` calls domain `declareWar` (25_000 gold, `WAR_LEAD_MS` 48h). `GuildService.withdraw` calls domain `withdraw` (`WITHDRAW_PERCENT`). Neither is a `LIVE_ROUTE`, and `App.tsx` does not post them. Hold tests save a war through the repository.
- `App.tsx` posts `/portal` and `/portal/ask`. It does not post `/city-fee`, `/node/tax`, `/node/access`, or `/node/grant`. Those four are still HTTP `LIVE_ROUTES`. Resource-node rows and captures are on the snapshot.
- The 24-hour portal lift and the 30-minute node drop are the domain thresholds above. The integration tests do not simulate 86_400_000 ms or 1_800_000 ms of ticks. `tickResourceNodes` passes `deltaMs`. `askHostilePortal` reads `blockedForMs`.
- No Steam listing and no trained GPU weight file. Those were not required.
- The GDD is not complete.
