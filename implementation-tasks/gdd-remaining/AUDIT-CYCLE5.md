# Independent audit, cycle 5

Date: 2026-10-08. Branch `cursor/implement-codebase-a579`. This file re-reads the production call chain (`main.ts` → `buildApp` → `compose`, HTTP `LIVE_ROUTES` / socket `bindGateway`, `runLive`, and `App.tsx`). Earlier "done" notes are not evidence.

**Verdict: NOT COMPLETE.** The cycle-4 five are still called from that path. The six items that were open are now called from that path as well. Required rules in those same systems that are still only a domain check, or that still have no owner, are listed under Still open.

## Cycle-4 five, re-read

1. **A kill, visit, or choice updates the quest that asked for it.** `advanceMatching` calls `askedObjective`. `templateOf` copies `monsterId ?? itemId ?? place`. `applyChoice` calls `recordChoice`. `POST /dialogue` calls `applyChoice`. `branchScene` reads `choiceId`. `settleStoryBeats` sets `barrierDown` from `shutdown` and `primordialOpened` from `outer_ring`. `tickOnce` calls `note(id, 'visit', nodeId)` when `nodeId` changes. Verified: `askedObjective`, `advanceMatching`, `templateOf`, `recordChoice`, `applyChoice`, `branchScene`, `settleStoryBeats`, `note`.

2. **The play session posts craft and trade.** `App.tsx` calls `startCraft` and `completeTrade`. Those post `/craft/start`, `/trade`, and `/trade/accept` and store the bodies with `setCraftJob` and `setTradeResult`. Verified: `startCraft`, `completeTrade`, `setCraftJob`, `setTradeResult`.

3. **Boot reloads wallet rows, auction lots, mail, and presence.** `buildApp` calls `hydrate` only when `databaseUrl` is non-empty. `hydrate` calls `readStored` and `loadPersisted`. Verified: `readStored`, `loadPersisted`, `hydrate`, `flush`.

4. **Ordinary steps follow `world.json`.** `geographyFrom` feeds `enterWorld`. Outside an encounter, `stepNode` calls `neighborStep` and `canWalk`. `encounter_enter` calls `enterEncounter`. `pursuePlayers` chases only that instance. `stepDungeon` walks `dungeonEdges`. Verified: `geographyFrom`, `enterWorld`, `neighborStep`, `canWalk`, `stepNode`, `enterEncounter`, `pursuePlayers`, `stepDungeon`.

5. **Cities, war, the validator, presence, and corpses.** `applyAttack` calls `combatZone`, which calls `pvpAllowed`. `validateCommand` rejects a missing edge and a safe-city attack. Socket `close` calls `onCarrierOffline`, which calls `removePresence`. A new downed player calls `createCorpse`. Verified: `combatZone`, `pvpAllowed`, `validateCommand`, `removePresence`, `createCorpse`, `onCarrierOffline`.

## Wired this cycle

1. **An objective with no `subject` does not move with every event of that kind.** `askedObjective` matches a named `subject` only to that monster, item, or place. An omitted `subject` matches `objective.id`, or the quest id only when that quest has exactly one unnamed objective of that kind. A bare kind matches nothing. `reportKind` uses the same function. Wiki notes `event.articleId`. Hack notes `event.subject ?? event.kind`. `dungeon` calls `note(characterId, 'visit', questId ?? place)`. Verified: `askedObjective`, `reportKind`, `note`.

2. **NPC reputation is a stored number per character and NPC.** `choiceReputation` maps `attack`, `fail`, and `quest` to those events and every other dialogue choice, including `serve`, `question`, and `gift`, to `gift`. `nextReputation` calls `bumpReputation` (+5 quest, −2 fail, −10 attack, +3 gift). `shiftReputation` writes `SimEntity.reputation`. Dialogue calls it when `npcId` is set. `quest.completed` and `quest.failed` call it with `npcId ?? questId`. `questRows` calls `reputationScene`, which appends the tier line only when a value is stored. The world snapshot includes `reputation`. Verified: `choiceReputation`, `nextReputation`, `bumpReputation`, `shiftReputation`, `reputationScene`, `reputationTier`.

3. **Portal price and cooldown are reachable.** `seedPortals` calls `setGuild('live')` and `saveNode` for each city. `POST /portal` and the `portal` live action call `portalTo`. `portalTo` calls `canPortal`, then `EconomyService.portal`, which calls `portalFee` (same side 5 gold / 5 min, cross side 10 gold / 10 min after the barrier, hostile blocked only when guild mode is live). On success the sim entity moves to the city cell and `travel` is cleared. `App.tsx` calls `startPortal`, which posts `/portal` and `setPortalResult`. Verified: `seedPortals`, `canPortal`, `portal`, `portalFee`, `portalTo`, `startPortal`, `setPortalResult`.

4. **A lone guild on a war city holds the flag.** `tickOnce` calls `tickCaptures` with `SIM_TICK_MS`. `tickCaptures` calls `advanceHold` and `holdWins` (`WAR_HOLD_MS` 600_000). Two guilds, or none, reset the timer. A won hold stays won. `guild_create` calls `assignGuild`, and `enterWorld` copies that id onto the player. `statePayload` includes `captures`. `hydrate` calls `readCaptures` from the rift-sim snapshot. The client `applySnapshot` stores `captures`. Verified: `tickCaptures`, `advanceHold`, `holdWins`, `assignGuild`, `readCaptures`, `applySnapshot`.

5. **A graph step spends OD from `WorldEdge.length`.** `stepNode` calls `edgeLength`. `walkEdge` calls `edgeStep` once per tick (1 OD, or 3 when running) and covers `cellsFor` cells. `edgeTravel` is one tick per action (`SIM_TICK_MS`). Not enough OD leaves `entity.travel` in place. Repeating the same step does not restart the length. `neighborStep` still returns `{ nodeId, cell }`. Verified: `edgeLength`, `edgeStep`, `edgeTravel`, `walkEdge`, `stepNode`.

6. **Two characters with one seed share a layout.** `dungeon` passes `groupId` (`party` leader when omitted) and `partySize`. `DungeonService.enter` calls `seedFor` (5-minute window, cap 8, party ≤4 shares, party size 1 still enters). `enterDungeon` copies `dungeonRooms` onto both entities. The response includes `rooms`. `App.tsx` calls `enterDungeon` for party size 2 (`groupId` `party`) and for party size 1. Verified: `enter`, `seedFor`, `enterDungeon`, `enterDungeon` (client), `setDungeonResult`.

## Still open

- A guild-owned city still has `cityFee` 0. Artifact 13 charges 1–5 gold on a crossing and 10% of services while a guild controls the city. `portalFee` will add a fee that is already stored, and nothing writes 1–5 or the service cut.
- Hostile portal access is only the rival-guild flag. A neutral asking the owners for entry is not a route.
- Resource-node capture (plant, then a 30-minute drop) is a different rule from the 10-minute city flag. No domain function implements it, and the tick does not.
- `build.installed`, `chat.message`, and `combat.hit` still call `note` for `craft`, `talk`, `learn`, `defend`, and `pvp` with no subject. Those notes no longer move an unnamed objective.
- Outside the geography graph, `move()` still spends no OD when the entity is not in combat. Only a graph step uses `WorldEdge.length`.
- Guild ids used by the hold tick are the members on `guild_create`, copied onto the sim entity. Boot restores `guildId` only when the rift-sim entity snapshot still has it. The guild table is not scanned to rebuild membership.
- `choiceId` and `branchScene` are still the story branch. Reputation is an additional stored number, not a replacement for that text.
- No Steam listing and no trained GPU weight file. Those were not required.
- The GDD is not complete.
