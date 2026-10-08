# Independent audit, cycle 9

Date: 2026-10-08. Branch `cursor/implement-codebase-a579`. This file re-reads the production call chain (`main.ts` → `buildApp` → `compose` `tickOnce`, HTTP `LIVE_ROUTES` / socket `bindGateway`, `runLive` in `dispatch.ts`, and `App.tsx`). A helper that the tick or the live route does not call is not wired.

**Verdict: NOT COMPLETE.** The nine cycle-8 leftovers below now have a production call. Artifact 17 is not finished. Functions that exist only in the domain, and rules this pass did not put on a route, are listed under Still open.

## Cycle-8 wiring that still holds

1. **Alliance break waits out 24 hours.** `pactLive` does not end an alliance on the notice. `tickOnce` calls `tickAllianceBreaks` → `breakAlliance`. `POST /pact/break` calls `breakStoredPact`. Verified: `breakAlliance`, `tickAllianceBreaks`, `breakStoredPact`, `pactLive`.

2. **`warWinner` and `settleWar` run from the tick.** `tickOnce` and `skipMs` call `tickCaptures`, which calls `warWinner` and `settleWar`. Muster and living guards force `heldMs: 0`. A draw sets `drawEndedAtMs`. The next declare reads `DRAW_WAR_COOLDOWN_MS` (3 days) through `warLimits`. Verified: `tickCaptures`, `warWinner`, `settleWar`, `warLimits`.

3. **Neutral capture is 25_000 gold, 48 hours, and a guard fight. Guild war is 50_000 gold and 20_000 resources.** `guildWar` calls `declareNeutralCity` → `declareNeutralCapture` when `cityOwner` is null. An owned city calls `guild.declareWar`. Verified: `declareNeutralCapture`, `declareWar`, `spawnNeutralGuards`.

4. **Contenders gate capture. Mercenaries and solo players cannot take the city.** `tickCaptures` keeps `contenderIds` to the war id. `presentGuilds` marks an open mercenary contract and those rows are excluded. Verified: `contenderRows`, `presentGuilds`, `registerContender`.

5. **Node access is split.** `POST /node/access` calls `setNodeAccess`. `resourceAccess` calls `nodeAccessCategory` and `nodeAccessAllows`. Verified: `setNodeAccess`, `nodeAccessAllows`, `resourceAccess`.

6. **Live auction tax uses `creditTax` and the city owner.** `auctionBid` calls `sellerProceeds`, `cityOwner`, then `creditTax`. A frozen owner skips the bank credit and records the sink as `void`. Verified: `auctionBid`, `creditTax`, `cityOwner`, `rewardsFrozen`.

7. **Mercenary kind changes patrol, combat, and escort.** `tickContracts` passes `kind` and `duty: contractDuty(walked)` into `tickContract`. Verified: `tickContracts`, `contractDuty`, `tickContract`.

8. **`tickOnce` awaits contract and vassal-tithe ticks.** `await tickContracts(SIM_TICK_MS)` and `await tickVassalTithes()`. `main.ts` uses `void built.tickOnce()`. Verified: `tickOnce`, `tickContracts`, `tickVassalTithes`.

9. **A suzerain is stored as a defender. The coalition channel is postable.** `rememberDefense` calls `suzerainDefenders`. `POST /coalition` calls `postCoalition` → `coalitionChannel`. `App.tsx` calls `postCoalition`. Verified: `rememberDefense`, `suzerainDefenders`, `openWarFronts`, `coalitionChannel`, `postCoalition`.

## Wired this cycle

1. **War respawn waits 30 seconds.** `settlePlayers` sets `downedAtMs` to the tick's `nowMs`. `stepTick` calls `applyRespawn(..., nowMs)`. When `warFrontFor` finds a front, `applyRespawn` returns `early` until `warRespawnReady` (`WAR_RESPAWN_DELAY_MS`, 30_000). The death tick itself is not ready. A fighter with no front still respawns on the next command. Verified: `settlePlayers`, `applyRespawn`, `warRespawnReady`, `warFrontFor`, `stepTick`.

2. **Vassal release is a later action.** `pactLive` stays true for a vassal until `brokenAtMs`. It does not end the pact at `VASSAL_RELEASE_MS`. `tickOnce` and `skipMs` call `tickVassalReleases` → `releaseVassal`. `breakStoredPact` uses `releaseVassal` for a vassal and `breakAlliance` otherwise. `POST /pact/break` is that route. Verified: `pactLive`, `releaseVassal`, `tickVassalReleases`, `breakStoredPact`.

3. **A dropped flag leaves the chest.** `settleNodeDrop` returns the chest unchanged and `seized: null` when the guild id becomes null. A later plant with `chest > 0` seizes that amount for the planter and zeros the chest. `advanceResourceNode` is the only caller of `settleNodeDrop`. `tickResourceNodes` calls `advanceResourceNode` and does not call `settleNodeDrop`. `tickOnce` calls `tickResourceNodes` and `applyNodeSeizure`. Verified: `settleNodeDrop`, `advanceResourceNode`, `tickResourceNodes`, `applyNodeSeizure`.

4. **Muster spawns a camp.** `openWarFronts` calls `spawnMusterCamps` before it returns. The camp id is `muster:${cityId}`, a hub one step off the city, linked by an edge of length 1. `tickOnce` calls `openWarFronts()` into a local, then copies `simWorld`, so the camp is not overwritten by the spread. Attacker respawn uses that `musterNodeId`. `nearestHub` is gone. Verified: `spawnMusterCamps`, `openWarFronts`, `warRespawnNode`, `applyRespawn`.

5. **An absent suzerain pays the named pact breach.** `tickOnce` and `skipMs` call `noteSuzerainPresence` and `penalizeAbsentSuzerains`. Presence is an online, living, non-monster member of the suzerain guild standing on the city node after the war has started and before it is closed. If the war is closed or the hold is settled and `appeared` is still false, `failSuzerainDefense` runs. That function is `breachNonAggression`: `NAP_BREACH_GOLD` (50_000) and `NAP_FLAG_MS` (7 days). Section 9.3 says the suzerain must defend and does not name a second fine. Section 9.4 is the only numbered pact penalty, and this is that penalty. Verified: `noteSuzerainPresence`, `penalizeAbsentSuzerains`, `failSuzerainDefense`, `breachNonAggression`.

6. **An escort completes when the walk reaches the destination.** `postMercenary` stores `destinationId`. `tickContracts` appends the mercenary's node to `trail`, then calls `contractDuty(walked)`. For `escort`, `contractDuty` calls `escortArrived` (trail starts at the contract node, ends at the destination, each step is an edge). `tickContract` pays only when `duty` is true. Standing still with no destination still fails. Verified: `postMercenary`, `escortArrived`, `contractDuty`, `tickContracts`, `tickContract`.

7. **A live buyout records the 5% in both places.** `auctionBid` calls `creditTax` for the city owner, unless `rewardsFrozen` is true, and always calls `recordAuctionTax` with that sink (`guild` or `void`). `taxLedger` is what `statePayload` sends as `tax`. After a buyout the recorded tax is not 0. Verified: `auctionBid`, `sellerProceeds`, `creditTax`, `recordAuctionTax`, `taxLedger`.

8. **One node around the city blocks attacks.** `inCitySafeRadius` is false on the city node itself and true on a graph neighbor of a city. `combatZone` returns `{ safeZone: true, pvpOpen: false }` for that ring before war and pvp flags. `applyAttack` calls `combatZone` for a non-monster attacker. Verified: `inCitySafeRadius`, `combatZone`, `applyAttack`.

9. **Section 11 runs on declare and settle.** `reviewSection11` is the rule. `guildWar` calls `reviewDeclaredWar` after a successful owned `declareWar`. `declareNeutralCity` calls `reviewDeclaredWar` after `saveWar`. Both clear `settledReviewed` for that city and push a `declared` stamp. `tickOnce` and `skipMs` call `reviewNewSettlements`, which stamps a settled hold once per city until the next declare (`win`, or `draw` when `drawEndedAtMs` is set) and calls `reviewSection11`. Reasons are `repeat_no_fight`, `same_roster` (roster length at least 2), `quick_win` (win, zero blows, `heldMs < WAR_HOLD_MS`), and `city_swap` (two different guilds). A legal 10-minute hold is not a quick win. `freezeRewards` adds the attacker to `frozenGuilds`. `creditGuildBank` returns immediately for a frozen guild. `guildCreate` sets `lastOfficeMs` from `previousOffice` before `guild.create` (`OFFICE_COOLDOWN_MS`, 7 days, and only an office in a different guild). `guildWithdraw` calls `withdraw` and then `logWithdrawal`. `tickCaptures` simulates only the latest started war for a city, so a new war is not stuck on the previous settled hold. Verified: `reviewSection11`, `reviewDeclaredWar`, `reviewNewSettlements`, `previousOffice`, `logWithdrawal`, `creditGuildBank`, `tickCaptures`.

## Still open

- `castLeaderVote` and `dissolveShares` are domain functions. Nothing in `apps/server` calls them. Guild creation voting (24 hours, quorum, tie) and dissolution confirmation are not on a live route.
- One character, one vote, and "an AI votes only while the carrier is online" are checked inside `reviewSection11` on bot rows from `repos.characters`. There is no `guild_vote` live route and `App.tsx` does not post a ballot.
- A multibox carrier fails `reviewDeclaredWar` with `carrier` only after `declareWar` or `declareNeutralCity` has already saved the war and charged the bank.
- `frozenGuilds` is process memory. Nothing clears it, and nothing freezes an in-flight withdrawal for review. `withdraw` still enforces the rank limits and the large-withdrawal confirm. `logWithdrawal` only appends `bankLog`.
- Section 8.3's sentence that the capturer takes the chest when the flag is taken down is the plant branch of `settleNodeDrop`. There is no separate route that removes a flag and pockets the chest without a new planter.
- `App.tsx` posts a mercenary with a fixed `mercenaryId` and no `destinationId`. The live `POST /mercenary` body accepts `destinationId`. The screen button does not collect a route.
- `skipMs` does not call `openWarFronts`. The muster camp is created on `tickOnce`. Production uses `tickOnce`.
- The 24-hour portal lift is still `askHostilePortal` inside `cityServiceAccess`. `reviewSection11` copies matching cities into `abuse.portalsLifted` and does not change that access check.
- Section 12 balance targets are not a system.
- No Steam listing and no trained GPU weight file. Those were not required.
- The GDD is not complete.
