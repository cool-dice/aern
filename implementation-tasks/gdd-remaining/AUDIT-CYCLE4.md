# Independent audit, cycle 4

Date: 2026-10-08. Branch `cursor/implement-codebase-a579`. This file re-reads the production call chain. Earlier "done" notes are not evidence.

**Verdict: NOT COMPLETE.** The cycle-3 nine and the five cycle-4 items below are called from `main.ts` → `buildApp` → `compose`, the HTTP/socket gateway, or `App.tsx`. Required systems that are still only a domain function, or that still advance every unscoped objective of one kind, are listed under Still open.

## Cycle-3 nine, re-read

1. **Login loads characters; create opens the guild wallet.** `POST /auth/login` awaits `resume`. `resume` calls `listByAccount`, then `openWallet`, `openCrafter`, and `enterWorld`. `rememberCharacter` calls `openWallet` with `GUILD_CREATE_GOLD` (10000). `guild.create` debits that wallet. Verified: `resume`, `listByAccount`, `openWallet`, `rememberCharacter`.

2. **Quest accept copies onto the sim entity; credit follows the actor.** `questAccept` calls `placeQuest`. `grantKill` uses `victim.lastAttackerId` and `victim.monsterId`. Gather uses `NODES[nodeId].resource`. Craft uses the crafted `itemId`. A node change calls `note(id, 'visit', nodeId)`. Verified: `placeQuest`, `grantKill`, `note`, `onObjective`.

3. **0 HP drops the kit and the client sends respawn.** `tickOnce` calls `kitOf` before `stepTick`. `settlePlayers` calls `fallDown`. `clearDroppedKit` empties the module. `toSimCommand` maps `respawn` to `respawnAtBind`. `App` sends that command through `commandForDowned`. Verified: `kitOf`, `fallDown`, `clearDroppedKit`, `respawnAtBind`.

4. **Season multiplier and neural load.** `tickOnce` reads `event.service.snapshot` and passes `spawnTagMultiplier` to `topUpSeasonSpawns`. Echo and path install call `saveBuild` and `setNeural`. Verified: `snapshot`, `topUpSeasonSpawns`, `installEcho`, `learnPath`, `setNeural`.

5. **Relic sockets and echo/path slots.** `socketCount` is 1/2/3/3. `progressionSlots` is `floor(level / 3)`. Both run inside the live install handlers. Verified: `socketCount`, `progressionSlots`, `saveBuild`.

6. **Dungeon, craft, trade, limbs, invasion.** `enterDungeon` sets the room graph. `stepDungeon` runs while `dungeonEdges` is set. `LIVE_ROUTES` includes `/craft/start`, `/craft/complete`, `/trade`, `/trade/accept`. `limbOf` reads aim. `commitCombatant` sets `legsDestroyed`. `tickOnce` calls `startInvasion` on barrier day. Verified: `enterDungeon`, `stepDungeon`, `craftStart`, `tradeOffer`, `tradeAccept`, `limbOf`, `commitCombatant`, `startInvasion`.

7. **Sidecar silence and observation length.** `observeAndSubmit` calls `observeEntity` (length 896) and enqueues `utilityAction` only when `nowMs - sidecarHeardAt > SIDECAR_TIMEOUT_MS` (200). Verified: `observeAndSubmit`, `observeEntity`, `utilityAction`, `noteSidecar`.

8. **Database boot loads the sim snapshot.** `buildApp` calls `hydrate` only when `databaseUrl` is non-empty. `isRiftSim` ignores a non-rift-sim document. `flush` awaits `snapshotJob` and rethrows. Memory mode does not call `hydrate`. Verified: `hydrate`, `isRiftSim`, `simSnapshot`, `flush`.

9. **Limb damage, sockets, and slots** are the same production functions as items 5 and 6. No separate placeholder counter was added.

## Wired this cycle

1. **A kill, visit, or choice updates the quest that asked for it.** `advanceMatching` skips an objective when `objective.subject` is set and differs from the event. `templateOf` copies `monsterId ?? itemId ?? place` onto `subject`. Ring objectives in `quests.json` are `visit` target 1 with `place` `primordial_outer`, `primordial_middle`, `primordial_inner`, and `primordial_city`. `applyChoice` calls `recordChoice` on the sim entity and the quest repository. `POST /dialogue` and the `dialogue` live action call `applyChoice`. `branchScene` reads `choiceId` for later scene text. `settleStoryBeats` sets `barrierDown` from `shutdown` and `primordialOpened` from `outer_ring`. It does not teleport. Walking onto the node is what credits the visit: `tickOnce` calls `note(id, 'visit', nodeId)` only when `nodeId` changes. Verified: `advanceMatching`, `templateOf`, `recordChoice`, `applyChoice`, `branchScene`, `settleStoryBeats`, `note`.

2. **The play session posts craft and trade.** `App.tsx` passes `onCraft` and `onTrade` into the play panels. Those handlers call `startCraft` (`POST /craft/start`) and `completeTrade` (`POST /trade` then `POST /trade/accept`) and store the response with `setCraftJob` and `setTradeResult`. Verified: `startCraft`, `completeTrade`, `setCraftJob`, `setTradeResult`. Covered by vitest (`renderToStaticMarkup` and a fake `fetch`). No browser session was run.

3. **Boot reloads wallet rows, auction lots, mail, and presence.** `hydrate` calls `readStored` before applying the `rift-sim` blob, then writes every `wallet:*` character back so the row wins. It reloads auction lots from that read and calls `social.loadPersisted` for `presence:*` and mail. `flush` still awaits and rethrows. Memory repositories omit `readStored` and `loadPersisted`. Verified: `readStored`, `loadPersisted`, `hydrate`, `flush`.

4. **Ordinary steps follow `world.json`.** `compose` builds `geographyFrom` (catalog nodes, sites, edges, and site edges) onto the sim world. `enterWorld` places the player on the bind node (`fort_humans` at `{0,0}`) with `inEncounter: false` and marks prototype monsters `inEncounter` with `instanceId`. `applyMove` calls `stepNode`, which calls `neighborStep`, when the player is outside a dungeon and outside the encounter. `neighborStep` calls `canWalk`. A direction is accepted only when the neighbor lies inside that facing (half of one of the eight directions). `params.to` names the edge when the direction is ambiguous. `stepTick` copies `geography` onto the next world. `encounter_enter` (`POST /encounter/enter`) sets `inEncounter` and cell `{0,0}`. `pursuePlayers` chases only players with `inEncounter === true`, and only the monster's own `instanceId` when that field is set. Inside `dungeonEdges`, `stepDungeon` still walks rooms. Verified: `geographyFrom`, `enterWorld`, `neighborStep`, `canWalk`, `stepNode`, `enterEncounter`, `pursuePlayers`, `stepDungeon`.

5. **Cities, war, the validator, presence, and corpses.** `applyAttack` calls `combatZone` whenever `geography` is set, and ignores the client's `pvpOpen` / `safeZone` for a player. `combatZone` calls `pvpAllowed`. A `safe` node blocks attacks. `pvpOpen` is true when `warCities` contains that node or `invasion` is `wave1`, `wave2`, or `climax`. `tickOnce` fills `warCities` from wars whose `startsAtMs` is already due (`saveWar` records them; `hydrate` reloads `listWars`). The encounter and a dungeon are open ground. `validateCommand` calls `neighborStep` for a graph step and `combatZone` for an attack; `ai.service.submit` calls that validator. `bindGateway` socket `close` calls `onCarrierOffline`, which calls `removePresence` (social `forget`, phase `offline`, no corpse). `tickOnce` calls `createCorpse` for each new corpse, which stamps `killerId` from `lastAttackerId`, and calls `removePresence` for a downed player without clearing the downed phase. Verified: `combatZone`, `pvpAllowed`, `validateCommand`, `removePresence`, `createCorpse`, `onCarrierOffline`.

## Still open

- Objectives with no `subject` still advance together. `advanceMatching` treats a missing subject as "any event of this kind", so one `wiki` or `hack` tick still completes every subjectless objective of that kind. `dungeon` in `dispatch.ts` calls `note(characterId, 'visit')` with no place.
- Personal branches are `choiceId` plus `branchScene`. There is no separate NPC reputation store.
- `EconomyService.portal` (domain `canPortal`, `portalFee`) is not a live route and is not called from `dispatch.ts` or `App.tsx`. Same-side 5 gold / 5 min and cross-side 10 gold / 10 min are not reachable from the play session.
- `holdWins` and `advanceHold` are domain functions. No server tick calls them, so the guild capture flag (plant, then hold) does not run.
- A graph step spends the same OD as one grid step and lands on the neighbor cell. `WorldEdge.length` is not a travel time.
- `dungeon.enter` does call `seedFor` (5-minute window, cap 8) when `/dungeon` is posted, but the play panels do not send a shared `groupId` or a party larger than 1. The default live call is a solo instance.
- No Steam listing and no trained GPU weight file. Those were not required.
- The GDD is not complete.
