# Independent audit, cycle 2

Date: 2026-10-08. Branch `cursor/implement-codebase-a579`, tip `bebb382` (`Record cycle 2 of the independent GDD audit.`). This file reads production code. It does not treat `AUDIT-INDEPENDENT.md` cycle 2 as evidence.

**Verdict: NOT COMPLETE.**

The server process does tick a flat encounter, and several HTTP routes call real domain functions. The playable GDD is still a prototype slice: accepted quests never land on the player the client renders, death does not respawn, login does not restore a saved character, and dungeons, crafting, trade, limb aims, relic sockets, and world events are not played from `main.ts`, `compose.ts`, the HTTP routes, the socket gateway, or `App.tsx`.

## Call chains that do run

- `apps/server/src/main.ts` calls `buildApp` → `compose`, then `setInterval(tickOnce, 100)`.
- `POST /auth/register` and `POST /characters` call `enterCharacter` → `enterWorld` → `prototypeEncounter` (`apps/server/src/compose.ts`).
- `prototypeEncounter` (`apps/server/src/sim/population.ts`) places the player, the five `PROTOTYPE_MONSTERS`, one elite per prototype (`eliteId` from `ELITE_CYCLE`), and `KEEPER_PROTOTYPE` (`keeper_enhanced_prototype`).
- `compose` calls `spawnNamed('keeper_enhanced', 'content:keeper_enhanced')` at startup. The returned entity is stored in `parked` and copied into the state payload as `{ id, level, phases }`. It is not pushed onto `simWorld.entities`. `POST /encounter` can insert it through `addEncounter`.
- `tickOnce` turns queued `step_*` / `run_*` / `attack_*` / `revive` / `respawn` / `loot_corpse` into sim commands with `toSimCommand`, then `stepTick`. It then calls `observeAndSubmit` and `publishState` → `broadcastState`.
- `settlePlayers` calls `fallDown` when a player’s hp is at or below 0. `settleMonsters` queues a dead monster and `stepTick` puts it back after `MONSTER_RESPAWN_MS` (30s).
- `POST /command` and `LIVE_ROUTES` call `runLive` for gather, hack start/guess, wiki, relic, echo, path, core, dungeon enter, quest accept/turn-in, guild create, auction bid, mail, title grant, and encounter.
- Hack passwords come from `newHack`: 4 symbols from `ABCDEFGH`, 3 attempts, `LOCKOUT_MS` = 600_000 (`packages/domain/src/hack.ts`).
- Guild create calls `gold.deduct` for `GUILD_CREATE_GOLD` (10_000) after `createGuild` requires `GUILD_CREATE_SIZE` (4).
- Auction buyout uses `sellerProceeds` (95/5) and `auctionTaxSink`. Guild-city tax is added with `GuildService.creditTax`. A neutral sale adds the tax to the in-memory `tax.void` counter.
- `apps/server/package.json` `build` runs `prisma generate` before `tsc`. `prisma/migrations/20261008000000_init/migration.sql` exists. `openRepositories` uses `createPrismaRepositories` when `DATABASE_URL` is non-empty. Prisma `flush` awaits tracked writes and rethrows. Character inserts have no `side` column (`characterData` in `apps/server/src/infra/db/prisma.ts`). Account, inventory, `quest_progress`, guild members, auction lots, and mail have write paths.
- `packages/content/data/world.json` `sites` names the artifact 20.2 places (`forest_city`, `dwarf_fortress`, `troll_refuge`, `ogre_camp`, `ash_spire`, `goblin_workshop`, per-region markets, `primordial_outer` / `primordial_middle` / `primordial_inner` / `primordial_archive`). `loadCatalog` casts `world.json` through, and `withGeography` appends `sites` onto `WorldRepository.load`.
- `App.tsx` calls `createApplication`, `createClientNet`, login/register `fetch`, `pressKey` → `sendKey`, and `applyServer` → `ingest` / `applySnapshot`. Panel buttons mount `PlayPanels`.

## Gaps

### 1. Login does not resume a saved character

- **Requirement:** login resumes the character into the world that `main.ts` ticks.
- **Files:** `apps/server/src/compose.ts` (`rememberCharacter`, `resume`, `POST /auth/login`).
- **What the code does:** `resume` walks `charactersByAccount`, a `Map` filled only by `enterCharacter` in this process. Login does not read `repos.characters`. After a restart the map is empty, so login returns tokens and leaves `simWorld` empty.
- **Severity:** high.

### 2. 0 HP does not respawn the player

- **Requirement:** 0 HP calls `fallDown` and `respawnAtBind`.
- **Files:** `apps/server/src/sim/tick.ts` (`settlePlayers`, `applyRespawn`); `apps/client/src/play/session.ts` (`pressKey`, `commandForKey`).
- **What the code does:** `settlePlayers` calls `fallDown`, sets `phase` to `downed`, and pushes a corpse from `entity.inventory` (players are spawned with no `inventory` field). `respawnAtBind` runs only inside `applyRespawn`, which requires a `respawn` command while `phase === 'downed'`. The client sends `step_*` and `attack_melee` only. A dead player stays downed on the cell where they fell. The inventory module is not emptied, so the GDD full-loot death (`docs/gdd.v1.md` §8) does not touch the kit from `grantStarter`.
- **Severity:** high.

### 3. Player quests and XP are not updated from play

- **Requirement:** player entities have `progress` and `quests` updated from kills, gathers, crafts, and visits. Objective kinds advance from those events and the client shows them.
- **Files:** `apps/server/src/sim/population.ts` (`quests: []`); `apps/server/src/runtime/dispatch.ts` (`questAccept`); `apps/server/src/sim/tick.ts` (`grantKill`); `apps/server/src/compose.ts` (`applyLife`, `reportKind`, `questRows`).
- **What the code does:** `quest_accept` writes the repository and does not copy the row onto the sim entity. `applyLife` / `onObjective` walk `entity.quests`, which stays `[]`, so gathers, crafts, and visits change nothing on the entity. `grantKill` calls `onKill` on the first player with `progress`, not the attacker, and advances that empty quest list. `reportKind` can increment a repository row after accept, but `statePayload` publishes `entity.quests`. `PlayPanels` then substitutes `{ id: 'tutorial', objectives: [] }` when the store list is empty. Kill credit, gather credit, and the on-screen quest are three different stores.
- **Severity:** high.

### 4. Season does not change tick numbers; neuroshock does not engage

- **Requirement:** weather, season, neuroshock, and mutation change numbers inside the tick from live state.
- **Files:** `apps/server/src/compose.ts` (`tickOnce`, `topUpSeasonSpawns`, `echo` via `dispatch.ts`); `apps/server/src/sim/weather.ts`; `packages/domain/src/events.ts`; `apps/server/src/sim/tick.ts` (`neuralOverload`, mutation roll).
- **What the code does:**
  - Weather can change numbers, later. `planWeather` schedules a roll for `now + ANNOUNCE_LEAD_MS` (5 minutes). After that, `combatWeather` applies the fields it knows (speed, hp per second, accuracy, vision, loot, monster damage, mutation chance). Storm `energyWeapon`/`resist`, magnetic `portals`, acid `armor`, sand `anomalyDamage`, and ice-wind `fireVulnerability` are dropped.
  - Season does not. `spawnMultiplier(season, seasonSpawnTag(season))` is always `1.2`, because the tag is defined as that season’s tag. `topUpSeasonSpawns(seasonSpawnCount(5))` ignores `simWorld.seasonSpawn` and always uses `round(5 * 1.2)`. No spawn carries `pack` / `fire` / `undead` / `ice`. `seasonResource` is computed in the event snapshot and never read. `seasonBonus()` becomes true on the first tick for every season.
  - Neuroshock does not. Players start at `nn: 0`, `nnLimit: 10`. `POST /echo` builds a fresh `BuildState` with `programs: []` and default level 1. `progressionSlots(1)` is 0, so `installEcho` returns `slots` and `setNeural(11, 10)` never runs. The returned build is not stored. `neuralOverload` stays false for a character created by the client.
  - Mutation can. `spore_rat` is in the encounter, `isMutagen` matches `spore`, and `tryApplyStatus('mutation')` feeds `tickStatuses`, which changes speed, damage, or hp. Spore-fog weather can roll the same status once that weather is active.
- **Severity:** high for season and neuroshock. Weather and mutation are partial.

### 5. Routes call services that do not play the system

- **Requirement:** gather, hack, wiki, relic, echo/path/core, dungeon enter, quests, guild gold, auction tax, mail, and titles are actually played.
- **Files:** `apps/server/src/runtime/dispatch.ts`; `apps/server/src/modules/dungeon/service.ts`; `apps/server/src/modules/build/service.ts`; `apps/server/src/modules/economy/service.ts`; `apps/server/src/compose.ts` (no economy wallet on character create).
- **What the code does:**
  - Gather, hack, wiki, mail, and titles call their services. Hack also puts the server password in `hackPassword` on every state payload.
  - Relic, echo, path, and core run on a `BuildState` built from the request (`programs: []`, `relicSocketFree: 1`, `inCityOrHub: true`). The next request starts from empty again. Socket counts and `floor(level / 3)` are not the character’s build.
  - `dungeon_enter` inserts an instance whose `layout` is `generateDungeon` of size `small`, and returns `instanceId`. The player cell, monsters, and tick stay on the flat prototype map. `leave` and `tickTtl` are not called from `tickOnce`.
  - Guild debit and auction tax run only if `repos.economy.getCharacter` already has a row. Register and `POST /characters` never call `creditGold` or `saveCharacter`. A character created from `App.tsx` has no wallet, so guild create returns `gold` and auction bid returns `missing`.
  - Auction tax is applied on buyout, not on a non-winning bid. `creditTax` no-ops when `listGuilds()` is empty, so a guild-city tax can sit on the ledger and never reach a bank.
- **Severity:** high.

### 6. Story acts are counters, not artifact 20.6

- **Requirement:** story acts match artifact 20.6 (survive and learn the Barrier, collect fragments, enter the primordial city through the rings, shut the Barrier off, meet the other side). Objective kinds are legal and advance from events.
- **Files:** `packages/content/data/quests.json`; `docs/gdd.v2/Артефакт 20.6. Сюжет.md`; `packages/domain/src/quests.ts`.
- **What the code does:** tutorial and act kinds are inside `QUEST_OBJECTIVE_KINDS`. `act1_light` through `act3_dark` are four or five counters (`survive`, `investigate`, `collect`, `visit`, `talk`, and the other artifact-15 kinds) with the act level bands. They do not name the council, Koval, the Archivists, the rings, the Archive, the Barrier shutdown, or meeting the other side. Nothing in the tick sets `barrierDown` or moves a player onto `primordial_outer`. Repository `report` can increment a counter after accept (gap 3); the published quest list does not.
- **Severity:** high.

### 7. Sidecar observation and utility AI do not act

- **Requirement:** the client spawns the sidecar, the 896-length observation comes from the sim, and 200 ms of silence selects a utility action that is played.
- **Files:** `apps/client/src/App.tsx`; `apps/client/src/play/sidecar.ts`; `apps/server/src/compose.ts` (`observeAndSubmit`); `apps/server/src/modules/ai/service.ts`.
- **What the code does:** `spawnMockSidecar({ start: true })` starts `mock-server.mjs` and writes `{"type":"ping"}`. `observeEntity` builds an `OBSERVATION_LENGTH` vector from the sim and `ai.service.submit` is called with `sidecarAtMs: now - SIDECAR_TIMEOUT_MS - 1`, so every submit is already past 200 ms. The utility action is discarded: `submit`’s promise is not read, and nothing pushes that action onto `pending`. The mock process never sees the vector.
- **Severity:** high.

### 8. Persistence writes, then the next boot ignores them

- **Requirement:** account, character, inventory, quest progress, guild members, auction, and mail survive a restart into the running world.
- **Files:** `apps/server/src/infra/db/prisma.ts`; `apps/server/src/compose.ts` (`emptyWorld`, `flush`).
- **What the code does:** the Prisma binders do write those rows, and HTTP `await composition.flush()` rethrows. The 100 ms loop uses `void repos.flush()`, and the rejection is thrown on the next `tickOnce`. `compose` always starts from `emptyWorld`. It never calls `loadSnapshot`. Economy `getCharacter` / lots / trades read the in-memory map that `bindEconomy` mirrors on write. Social presence is memory; mail and titles are written underneath. A restarted process with `DATABASE_URL` does not place the saved character, wallet, or sim back into the tick.
- **Severity:** high.

### 9. Required GDD systems with no live call

A function that is only defined, or only started inside `modules`, is not done.

| Requirement | Files | What the code does | Severity |
|---|---|---|---|
| Dungeons you can walk | `modules/dungeon/service.ts`, `compose.ts` | Layout is stored on the instance. The player never enters a room. Edge travel is not a command. | high |
| Crafting loop | `modules/craft/service.ts`, `compose.ts`, `App.tsx` | `createCraftModule` is started and then unused. No route calls `start` / `complete`. The craft panel lists recipe ids and does not post a craft. `item.crafted` never fires from play, so the craft quest counter has no crafting source (`build.installed` also calls `note(..., 'craft')`). | high |
| Player trading | `modules/economy/service.ts`, `LIVE_ROUTES`, `play/screens.tsx` | `offerTrade` / `acceptTrade` exist. No route calls them. The trade screen builds an empty offer from local gold. | high |
| Death penalties | `packages/domain/src/death.ts`, `sim/tick.ts` | Domain wear-on-death and an empty-inventory corpse exist. The inventory service, bind node, and XP-kept-but-loot-lost rule are not applied to the character who died. | high |
| Limb damage | `packages/domain/src/combat.ts`, `sim/commands.ts`, `sim/tick.ts` | `toSimCommand` sets `aim: null`. Hits use torso. `legsDestroyed` is only read (`?? 0`) and is never assigned. Arm/head debuffs from an aimed shot are not reachable from the gateway or `App.tsx`. | high |
| Relic sockets | `runtime/dispatch.ts` `relicOf`, `build.ts` `installEcho` | Each install uses a new relic with `echoIds: []` and `relicSocketFree: 1`. Sockets are not loaded or saved on the character. | high |
| Echo/path slots `floor(level / 3)` | `packages/domain/src/build.ts`, `dispatch.ts` `buildState` | `installEcho` / `learnPath` check `progressionSlots` on the request’s empty program list. The resulting state is dropped. A second echo does not see the first. | high |
| PvP zones | `sim/commands.ts`, `compose.ts`, `docs/gdd.v1.md` §3.4 and §7.3 | `safeZone` on the sim world is never set from the node. Client attacks omit `pvpOpen`. `resolveAttack` blocks a hit only when `safeZone && !pvpOpen`. Cities, the open wild, and war-only city fights are not applied. | medium |
| World events | `modules/event/service.ts`, `compose.ts` | Weather rolls are the only event the tick starts. `startInvasion` is never called from compose, routes, or the gateway. `holidayMultiplier` is unused. Seasonal monster tags and resource nodes are unused. | high |

### 10. Stubs still in the production path

- `emptyWorld` is the world every process starts from. Entering a character adds the prototype encounter on a flat grid. The geography graph is a side list in `/state`, not the space the tick moves through.
- `createCraftModule` is constructed, `start`ed, and never called again.
- `createAiModule` is given `presence.remove` and `corpse.create` that return `undefined`, and a validator that always returns ok.
- `observeAndSubmit` discards the utility action.
- `HackScreen` defaults `hint` to `'ABCD'` when `hackPassword` is null (`apps/client/src/ui/screens.tsx`). An active hack session passes the server password through.
- `feature_stub` remains an error code in `packages/protocol`. Compose guild mode is `'live'`. Live routes do not return `feature_stub`.
- Commands that are neither `toSimCommand` nor `isLiveAction` are removed from `pending` and dropped.

## Smallest next cycle

Wire the session the client already drives, and stop there.

1. On login, load that account’s characters from the character repository and `enterWorld`. On create, open an economy wallet and copy starter inventory onto the sim entity.
2. On quest accept, put the repository row on `entity.quests`. Advance that row from the killer, the gatherer, the crafter, and the visitor, and publish it. Credit XP to the attacker.
3. At 0 HP, move the inventory-module stacks onto the corpse with death wear, and clear them. Send `respawn` from the client so `respawnAtBind` runs at the bind cell.
4. Push the utility action onto `pending` when the sidecar has actually been silent for more than 200 ms. Pass the 896-vector to that process, or stop treating the ping mock as the observation path.

Leave dungeon rooms, the craft job loop, player trade, aimed limbs, stored relic sockets, and invasions for the cycle after this one. Those systems are still absent; closing the session loop is the smallest change that makes the cycle-2 claims true.
