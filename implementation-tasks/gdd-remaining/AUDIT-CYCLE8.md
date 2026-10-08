# Independent audit, cycle 8

Date: 2026-10-08. Branch `cursor/implement-codebase-a579`. This file re-reads the production call chain (`main.ts` → `buildApp` → `compose` `tickOnce`, HTTP `LIVE_ROUTES` / socket `bindGateway`, `runLive` in `dispatch.ts`, and `App.tsx`). A helper that the tick or the live route does not call is not wired.

**Verdict: NOT COMPLETE.** The cycle-7 claims below are on the live path, and the city-war, diplomacy, node-access, and war-respawn items from the cycle-7 still-open list now have a production call. Rules in those same areas that are still a fuse, a missing delay, or a GDD sentence the tick does not follow are listed under Still open.

## Cycle-7 claims, re-read

1. **Auction 5% in a guild city is credited from live captures. A neutral city sinks it.** `auctionBid` calls `sellerProceeds`, then `cityOwner` (won `captures`), then `guild.creditTax({ amount, guildId })`. `creditTax` deposits into that guild bank, or returns `void` when the owner is null. The bid slice does not read `guildCity` and does not call `creditGuildBank`. `bidAuction` no longer calls `auctionTaxSink`. Verified: `auctionBid`, `sellerProceeds`, `cityOwner`, `creditTax`.

2. **Extended storage is 1 gold per day per slot, rented from the play session.** Unchanged from cycle 7. `STORAGE_GOLD_PER_SLOT_DAY` is 1. `POST /storage` calls `rentCityStorage`. `App.tsx` calls `rentStorage`. Verified: `rentStorage`, `rentCityStorage`.

3. **Alliances, coalitions, vassals, and non-aggression pacts are stored. `portalStance` can return `ally`.** `POST /pact` calls `formPact`. `portalStance` returns `ally` when `pactAlly` is true. Verified: `formPact`, `pactAlly`, `portalStance`.

4. **The same stance check gates portal, storage, library, bind, auction, and repair.** `cityServiceAccess` calls `askHostilePortal` with `portalStance` for every city service. `resourceAccess` now uses that same `portalStance` for nodes (next section). Verified: `cityServiceAccess`, `portalStance`, `askHostilePortal`.

5. **Mercenary contracts and intra-guild patrols have a tick and a live route.** `POST /mercenary` and `POST /patrol` are live. `tickOnce` awaits `tickContracts`. Kind now changes the outcome (below). Verified: `postMercenary`, `postPatrolQuest`, `tickContracts`, `tickContract`.

6. **A dropped resource-node flag seizes the chest. Officer tax cap is 0–15%.** `tickOnce` calls `tickResourceNodes`, which calls `advanceResourceNode` and reads `advanced.seized`. `advanceResourceNode` calls `settleNodeDrop` and does not return the chest on the node after a drop. `tickResourceNodes` does not call `settleNodeDrop` itself. Officer cap is still `NODE_TAX_OFFICER_MAX` (15) inside `setNodeTax`. Verified: `tickResourceNodes`, `advanceResourceNode`, `settleNodeDrop`, `applyNodeSeizure`, `setNodeTax`.

7. **Declare-war and withdraw are live routes the session posts.** `POST /war` and `POST /guild/withdraw`. An unowned city now branches to `declareNeutralCity` (below). An owned city still calls `guild.declareWar` (50_000 gold, 20_000 resources). `App.tsx` calls `declareWar` and `withdrawBank`. Verified: `guildWar`, `declareWar`, `declareNeutralCity`, `guildWithdraw`.

8. **The session posts city-fee, node tax, node access, and node grant.** `App.tsx` calls `setCityFee`, `setNodeTax`, `setNodeAccess` (now with `category`), and `grantNode`. Verified: `setCityFee`, `setNodeTax`, `setNodeAccess`, `grantNode`.

## Wired this cycle

1. **Neutral-city capture is its own path.** `guildWar` calls `declareNeutralCity` when `cityOwner` is null, and does not call `guild.declareWar`. `declareNeutralCity` calls `declareNeutralCapture` (`NEUTRAL_CAPTURE_GOLD` 25_000, `WAR_LEAD_MS` 48 hours, `NEUTRAL_GUARD_COUNT` 2). `tickOnce` and `skipMs` call `spawnNeutralGuards` once per city. While `guardRows` reports living `cityGuard` entities, `tickCaptures` keeps `heldMs` at 0. A dead city guard is not put on the monster respawn queue (`entity.cityGuard === undefined` around the respawn push in `settleMonsters`). Verified: `declareNeutralCapture`, `declareNeutralCity`, `spawnNeutralGuards`, `guardRows`, `tickCaptures`.

2. **`warWinner` and `settleWar` run from the tick.** `tickOnce` calls `tickCaptures`. That function calls `warPhase`, `assaultWindowMs`, `advanceHold`, `holdWins`, `warWinner`, and `settleWar`. Muster and a living guard force `heldMs: 0`. A draw sets `drawEndedAtMs`. `warLimits` feeds that into the next `declareWar` (`DRAW_WAR_COOLDOWN_MS`, 3 days). Verified: `tickCaptures`, `warWinner`, `settleWar`, `warLimits`, `drawEndedAtMs`.

3. **Contender rows gate the capture.** `tickCaptures` builds `contenderIds` from `contenderRows` (`contenders` joined to `openWars`). `warWinner` only sees claimant fighters. Mercenaries are flagged in `presentGuilds` and excluded. A guild that is not a contender cannot be `holder`. Verified: `contenderRows`, `presentGuilds`, `warWinner`.

4. **Alliance break is a later action.** `pactLive` does not end an alliance when `breakNoticeAtMs` is set. `tickOnce` calls `tickAllianceBreaks` → `breakAlliance`, which sets `brokenAtMs` only after `ALLIANCE_BREAK_MS` (24 hours). `POST /pact/break` calls `breakStoredPact`. `App.tsx` calls `breakPact`. Verified: `breakAlliance`, `tickAllianceBreaks`, `breakStoredPact`, `pactLive`.

5. **A suzerain is recorded when the vassal is attacked. Ally markers are drawn. A coalition has a channel.** After a successful guild-city `declareWar`, `guildWar` calls `rememberDefense`. `declareNeutralCity` calls it too. `rememberDefense` calls `suzerainDefenders`. The rows are `defenses` on `statePayload`, and `openWarFronts` puts those suzerains in `defenderGuildIds`. `statePayload` calls `allyMarkers` → `pactAlly`. `MapScreen` renders `data-ally` from `mapModel`. `POST /coalition` calls `postCoalition` → `coalitionChannel`. A guild outside a live coalition gets `channel`. `App.tsx` calls `postCoalition`. Verified: `suzerainDefenders`, `rememberDefense`, `openWarFronts`, `allyMarkers`, `mapModel`, `coalitionChannel`, `postCoalition`.

6. **Node access is three policies.** `ResourceNode.access` is `{ allies, guilds, neutrals }`. `POST /node/access` requires `category` and calls `setNodeAccess`. `resourceAccess` calls `portalStance`, then `nodeAccessCategory`, then `nodeAccessAllows`. Members skip the policy. Request still needs `nodeGrants`. Verified: `setNodeAccess`, `nodeAccessCategory`, `nodeAccessAllows`, `resourceAccess`, `portalStance`.

7. **One function owns chest seizure.** See cycle-7 claim 6. `advanceResourceNode` returns `{ node, seized }` and is the only caller of `settleNodeDrop` on this path.

8. **The live auction bid uses `creditTax`.** See cycle-7 claim 1. `auctionTaxSink` remains a domain function and is not called from `bidAuction`.

9. **Mercenary kind changes the outcome.** `tickContracts` passes `kind: contract.kind` and `duty: contractDuty(contract)` into `tickContract`. Patrol completes on presence for `durationMs`. Defend completes only when that mercenary was hit (`lastAttackerId` or `hp < maxHp`). Attack completes only when some entity or corpse records them as `lastAttackerId` / `killerId`. Escort completes only when `contractDuty` sees a different `nodeId`. Standing still until `untilMs` fails defend, attack, and escort. Verified: `tickContract`, `contractDuty`, `tickContracts`.

10. **`tickOnce` awaits contract ticks and vassal-tithe ticks.** `async function tickOnce` calls `await tickContracts(SIM_TICK_MS)` and `await tickVassalTithes()` after the sim step, rejection count, and snapshot job. `main.ts` uses `void built.tickOnce()`. `skipMs` still awaits both as well. Verified: `tickOnce`, `tickContracts`, `tickVassalTithes`, `tickAllianceBreaks`.

11. **War respawn branches.** `tickOnce` sets `warFronts: openWarFronts()` on the world before `stepTick`. `applyRespawn` calls `warRespawnRole`, `warRespawnNode`, and `respawn`. Defenders get the city node and keep their bind. Attackers get `musterNodeId` (nearest `kind: 'hub'`, else `cross_light`) until `captured`, then `respawn` moves `bindNodeId` to the city. A fighter with no front still uses `respawn` with the civilian bind. Verified: `openWarFronts`, `nearestHub`, `applyRespawn`, `warRespawnRole`, `warRespawnNode`, `respawn`, `respawnAtBind`.

## Still open

- War respawn is immediate. Artifact 17 §5.5 also says respawn is 30 seconds after death. `applyRespawn` does not wait. The session test that respawns on the next command still passes because that delay is not gated.
- Vassal release is still the fuse inside `pactLive`: a vassal pact ends when `nowMs >= breakNoticeAtMs + VASSAL_RELEASE_MS`. There is no later release action that leaves the pact up after the 7 days the way `breakAlliance` does for alliances.
- Artifact 17 §8.4 says that when control is lost the chest stays on the node and the next planter takes it. The live drop does the opposite: `advanceResourceNode` seizes the chest for the guild that lost the flag. That is the cycle-7/8 seizure rule, not the "chest stays" sentence.
- `nearestHub` is the closest catalog hub. There is no muster camp spawned around the city for the 30-minute muster.
- A suzerain's duty is stored, they count as defenders for respawn, and the session can see `defenses`. Nothing penalizes a suzerain who never walks to the city.
- Escort pay on a real walk is `contractDuty` plus `tickContract` when `duty` is true. The integration test checks that standing still fails and that a killing blow completes an attack. It does not walk an escort contract to `complete`.
- `bidAuction` no longer adds to `taxLedger`. `statePayload` still sends `tax`, and that ledger stays at 0 for a live buyout. The guild bank credit is `creditTax`.
- A safe zone of one node around the city (artifact 17 §11, camping the bind) was not found as its own radius. City nodes stay `safe` through `combatZone`.
- Repeated wars, frozen rewards, and the rest of §11 were not found on the declare or settle path.
- No Steam listing and no trained GPU weight file. Those were not required.
- The GDD is not complete.
