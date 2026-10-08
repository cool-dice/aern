# Independent audit, cycle 3

Date: 2026-10-08. Branch `cursor/implement-codebase-a579`. This file re-reads the production call chain after the cycle-3 wiring. It does not treat earlier "done" notes as evidence.

**Verdict: NOT COMPLETE.** The nine cycle-2 gaps below are wired into `main.ts` → `buildApp` → `compose` / the HTTP routes / `App.tsx`. The playable GDD is still a prototype: the open world is the flat encounter plus a dungeon graph, story objectives advance by kind rather than by a dialogue chain, and several persisted rows are not what the next boot places back into the tick.

## Wired

1. **Login resume and the guild wallet.** `POST /auth/login` awaits `resume`. `resume` calls `CharacterRepository.listByAccount` (Prisma `findMany` when `DATABASE_URL` is set, `MemoryWorld` otherwise), then `openWallet`, `openCrafter`, and `enterWorld`. `rememberCharacter` (character create) calls `openWallet` with `GUILD_CREATE_GOLD` (10000) via `newEconomyCharacter`, so `guild.create` can debit that wallet. Verified: `resume`, `listByAccount`, `openWallet`, `rememberCharacter`.

2. **Quests on the sim entity, credited to the actor.** `questAccept` calls `quest.service.accept` then `placeQuest`, which copies the active `QuestProgress` onto `entity.quests`. `statePayload` / `questRows` publish those quests on `/state`. `grantKill` uses `victim.lastAttackerId` (set in `applyAttack`). `note` → `applyLife` → `onObjective` advances the actor for gather, craft, and visit (`bus` handlers `gather.completed`, `item.crafted`, and `dungeon` → `note(..., 'visit')`). Verified: `placeQuest`, `questRows`, `grantKill`, `applyLife`, `onObjective`.

3. **Death, corpse kit, client respawn.** `tickOnce` copies the inventory module onto the entity with `kitOf` before `stepTick`. `settlePlayers` calls `fallDown` (domain `applyWear` / `wearFor('death')`). Quest item ids on `entity.quests` are marked `questItem` and `questOwnerId`. `clearDroppedKit` empties the module after a new corpse. `App.applyServer` calls `commandForDowned` and `sendKey('respawn')`, which `toSimCommand` turns into `respawnAtBind`. Verified: `kitOf`, `fallDown`, `clearDroppedKit`, `commandForDowned`.

4. **Season spawns, neural load, mutation, weather.** `tickOnce` reads `event.service.snapshot` and passes `spawnTagMultiplier` into `topUpSeasonSpawns` (not `seasonSpawnCount`). Echo, path, and core installs call `setNeural`. `enterWorld` calls `applyStoredNeural`. `stepTick` still applies `combatWeather` and rolls `tryApplyStatus` mutation. Verified: `snapshot`, `topUpSeasonSpawns`, `setNeural`, `applyStoredNeural`, `combatWeather`.

5. **Stored build, program slots, relic sockets.** `relic`, `echo`, `path`, and `core` in `dispatch.ts` call `loadBuild` / `saveBuild`. The character row stores `build` (programs, cores, `relicSocketFree`, `relicGrade`). `installEcho` / `learnPath` enforce `progressionSlots` (`floor(level / 3)`). Relic sockets use `socketCount` (1/2/3/3) minus installed echoes. Verified: `loadBuild`, `saveBuild`, `progressionSlots`, `socketCount`.

6. **Dungeon, craft, trade, aim, invasion.** `dungeon` calls `enterDungeon`, which sets `dungeonId`, `roomId`, `dungeonRooms`, and `dungeonEdges`. `applyMove` calls `stepDungeon` while those fields are set; `leaveDungeon` clears them. `craftStart` / `craftComplete` call `craft.service().start` / `complete` from `LIVE_ROUTES` (`/craft/start`, `/craft/complete`) and from `POST /command` via `runLive`. `tradeOffer` / `tradeAccept` call `economy.offerTrade` / `acceptTrade`. `toSimCommand` reads `limbOf(params.aim)`. `commitCombatant` sets `legsDestroyed` from leg HP, and `applyMove` passes it to `cellsFor`. On `barrier_day`, `tickOnce` calls `startInvasion` and copies `keeperBonus` / `craftBonus` onto the sim. Verified: `enterDungeon`, `stepDungeon`, `leaveDungeon`, `craftStart`, `tradeOffer`, `tradeAccept`, `limbOf`, `commitCombatant`, `startInvasion`.

7. **Story scenes.** Act objectives in `packages/content/data/quests.json` name the Barrier, the outer/middle/inner rings, the Archive, Shutdown, the other side, the council, Koval, and the Archivists. Kinds stay inside `QUEST_OBJECTIVE_KINDS`. `templateOf` and `copyObjective` keep `scene`. `questRows` publishes it. `settleStoryBeats` calls `setWorldFlagOnce` for `shutdown` (`barrierDown`) and `outer_ring` (`primordialOpened`) and sets `nodeId` to `primordial_outer`. Verified: `templateOf`, `copyObjective`, `questRows`, `settleStoryBeats`, `setWorldFlagOnce`.

8. **Sidecar protocol and utility.** `apps/sidecar/mock-server.mjs` answers `ping` with `pong`, `encode` with a 896-vector, and `observe` with `{ type: 'action' }`. `App` calls `spawnMockSidecar` and `observe` with the state's 896-vector, then `POST /sidecar`. `observeAndSubmit` builds the vector with `observeEntity` (`OBSERVATION_LENGTH` 896). Utility runs only when `nowMs - sidecarHeardAt > SIDECAR_TIMEOUT_MS` (200). `utilityAction`'s choice is pushed onto `pending` for the next `tickOnce`. `noteSidecar` records a live sidecar reply so a recent action is not treated as silence. Verified: `observeAndSubmit`, `observeEntity`, `utilityAction`, `noteSidecar`, `spawnMockSidecar`.

9. **Database boot.** `buildApp` calls `hydrate` when `databaseUrl` is non-empty. `hydrate` calls `loadSnapshot`. A payload with `kind: 'rift-sim'` replaces `emptyWorld` via `isRiftSim` and restores `wallets` through `saveCharacter`. Other payloads (including the prisma unit-test document `{ tick: 4, entities: ['lia'] }`) are ignored. `tickOnce` saves that document from `simSnapshot`. `flush` awaits the snapshot promise and `repos.flush()`, and rethrows. Memory mode does not call `hydrate`. Verified: `hydrate`, `isRiftSim`, `simSnapshot`, `loadSnapshot`, `flush`.

## Still open

- Story objectives of one kind all advance on the same event (`onObjective` / `advanceMatching`). The rings are repeated `visit` counters, not three rooms the player must walk. `recordChoice` is never called from `compose`, so personal dialogue branches from artifact 20.6 and artifact 15 are not played.
- `App.tsx` does not post `craft_start`, `craft_complete`, `trade_offer`, or `trade_accept`. Those routes exist; the play panels do not call them.
- Boot loads wallets from the `rift-sim` snapshot. It does not scan `wallet:*` storage rows, and it does not reload auction lots, mail, or social presence into the tick.
- The open world is still `prototypeEncounter` on a flat grid. Geography sites are listed on `/state` and used for the outer-ring teleport. Ordinary steps are not confined to the world graph.
- `safeZone` / `pvpOpen` are not taken from the node's city or war rules. The AI validator in `compose` always returns ok, and `presence.remove` / `corpse.create` are no-ops.
- The GDD is not complete.
