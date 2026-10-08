# Independent audit, cycle 13

Date: 2026-10-08. Branch `cursor/implement-codebase-a579`. This file re-reads the production call chain (`main.ts` → `buildApp` → `compose` `tickOnce` / `skipMs`, HTTP `LIVE_ROUTES` / socket `runLive` in `dispatch.ts`, and `App.tsx`). A helper that the tick, the skip, or a live route does not call is not wired.

**Verdict: NOT COMPLETE.** The four cycle-12 leftovers now have a production call. One extra system with concrete refusal rules, the contract board, is on a live route. Rules this pass saw and did not wire are listed under Still open.

Section 12's war-duration row (1–1.5 real hours) is a balance score from `measureSection12`, not a gate, and it is not still-open work. Section 5 stays the war clock: muster 30 minutes, assault 60, hold up to 10, finish 5 (`WAR_MUSTER_MS`, `WAR_ASSAULT_MS`, `WAR_HOLD_MS`, `WAR_FINISH_MS`). Those phases were not retuned. `tickOnce` and `skipMs` still call `sampleBalance` → `measureSection12`. `SECTION12.warDurationMinMs` is 3 600 000 and `warDurationMaxMs` is 5 400 000.

## Cycle-12 wiring that still holds

1. **A reward freeze waits for a reviewer, then the release credits the character wallet.** `rewardFreezeEnds` is true only when `reviewedAtMs !== null` and `nowMs >= reviewedAtMs`. `tickOnce` and `skipMs` call `inspectRewardFreezes`. `POST /guild/review` is `guild_review` → `reviewRewardFreeze` → `acceptRewardReview`. Accept calls `releaseHeldWithdrawals` → `creditWithdrawal` (`creditGold`, `creditMaterial`, `giveItems`). Verified: `rewardFreezeEnds`, `inspectRewardFreezes`, `reviewRewardFreeze`, `acceptRewardReview`, `releaseHeldWithdrawals`, `creditWithdrawal`.

2. **Guild creation refuses a moderated name, a live office inside 7 days, and an abuse or alt ban.** `guildCreate` calls `screenGuildCreate` → `screenCharter` before `ports.guild.create`. `textHitsBlacklist` uses `GUILD_NAME_BLACKLIST`. `OFFICE_COOLDOWN_MS` is 7 days. `POST /guild/ban` is `guild_ban` → `banFounder` → `applyCreationBan` (collusion 30 days, alt-guild `untilMs: null`). Verified: `screenGuildCreate`, `screenCharter`, `textHitsBlacklist`, `banFounder`, `applyCreationBan`.

3. **Every founder confirms. Emblem and description are stored when the leader poll closes.** `guildCreate` calls `confirmFounders` → `foundersConfirmed` before create, passes `emblem: ''` and `description: ''`, and calls `seatCharter` rather than `seatFounders`. `openLeaderPoll` keeps the strings. `finishLeaderPoll` writes `poll.emblem` and `poll.description`. Verified: `confirmFounders`, `foundersConfirmed`, `openLeaderPoll`, `finishLeaderPoll`, `seatCharter`, `seatFounders`.

4. **The play session posts an internal ballot choice and an emblem.** `App.tsx` calls `castGuildChoice` with `choice: 'yes'` (`POST /guild/vote`) and `postGuildEmblem` (`POST /guild/emblem` → `setCharterEmblem`). Verified: `castGuildChoice`, `postGuildEmblem`, `setCharterEmblem`, `castInternalBallot`.

5. **Dissolution pays each contributed resource kind and item share from the contribution ledger.** `payDissolution` calls `dissolveShares`, `dissolveHoldings`, and `dissolveKindPiles`. Resource shares use `creditMaterial(share.id, pile.kind, share.amount)`. Item shares use `giveItems`. Verified: `payDissolution`, `dissolveShares`, `dissolveHoldings`, `dissolveKindPiles`, `creditMaterial`, `giveItems`.

6. **Section 8.7 guild quests are posted and settled from the tick.** `POST /guild/quest` is `guild_quest` → `acceptGuildQuest` → `postGuildQuest`. `tickOnce` and `skipMs` call `tickGuildQuests` → `settleGuildQuest` → `tickContract`. `PATROL_QUEST_MS` is 3 hours and `PATROL_QUEST_GOLD` is 5 000. `App.tsx` calls `postGuildQuest`. Verified: `acceptGuildQuest`, `postGuildQuest`, `tickGuildQuests`, `settleGuildQuest`, `tickContract`.

7. **`main.ts` still ticks every 100ms** with `void built.tickOnce()`.

## Wired this cycle

1. **`setDoctrine` is a live route, and the play session posts a doctrine change.** Artifact 16 §7 and artifact 17 §3.2: one active doctrine, `DOCTRINE_COOLDOWN_MS` of 7 days, costs from `DOCTRINE_COST`. `POST /guild/doctrine` is `guild_doctrine` → `changeDoctrine` → `setDoctrine`. An officer or novice returns `rank`. A leader, council member, or veteran must send `leaderConfirm === true` and an integer `councilConfirms` from 1 through `councilSize` (the council cannot be skipped, and a count above the seated council is refused). Doctrine id alone returns `confirm`. A success spends the guild bank gold and the doctrine resource stocks, logs op `doctrine`, and stores the doctrine. `tickOnce` calls `stampGuildDoctrines` → `stampDoctrine` before `stepTick`. Fury scales weapon damage with `applyDoctrine`. Guard scales armor at read time in `toCombatant`. Fortitude scales max hit points from `doctrineBaseMaxHp` so the bonus does not compound. Greed floors gold stack quantity with `applyDoctrine`. Knowledge scales kill experience in `onKill`. Labor divides gather seconds by `doctrineMultiplier('labor')` in `gather`. `App.tsx` calls `postDoctrine` with `doctrine: 'fury'`, `leaderConfirm: true`, and `councilConfirms: 1`. Verified: `changeDoctrine`, `setDoctrine`, `stampGuildDoctrines`, `stampDoctrine`, `applyDoctrine`, `doctrineMultiplier`, `postDoctrine`.

2. **Guild members can read the bank operations.** Artifact 17 §4.1: every operation is visible to members, including novices. `logBank` appends rows with `op` (and resource or item fields when those moved). `logWithdrawal` is op `withdraw`. `POST /guild/bank` is `guild_bank` → `readBankLog`, which returns `{ operations }` for any `memberRank`, including novice, and `member` for anyone else. `statePayload` puts those rows on `bankOperations` for the focus guild. `reviewSection11` still passes `bankLog.length` as `withdrawalsLogged`; the member path is the row route, not that count. `App.tsx` calls `readBankLog`. Verified: `logBank`, `logWithdrawal`, `bankOperations`, `readBankLog`.

3. **A large withdrawal does not succeed from `amount` alone.** `guildWithdraw` already passed `leaderConfirm`, `councilConfirms`, and `councilVote` into `withdraw`. The play session now sends them when the amount crosses the bands. `withdrawBank` compares `amount` with `Math.floor(bank * 10 / 100)` and `Math.floor(bank * 25 / 100)`. Over 10% the body includes `leaderConfirm` and `councilConfirms`. Over 25% it also includes `councilVote`. An amount with no `bank` stays amount-only, so a 1-gold post does not invent confirms. `App.tsx` calls `withdrawBank` with `amount: 26` and `bank: 100`, which is over both bands. Verified: `withdraw`, `guildWithdraw`, `withdrawBank`.

4. **Each racial city used for guild registration has a hall, and registration reads that place.** Artifact 17 §2.1 allows a city, a hall, or a registrar. The domain `registrationPlace` is unchanged: omitted place still becomes `hall`, and `city` remains a legal place. Production `registerAtHall` reads `node.place` from the geography graph. A client `place` that differs from the graph place returns `place`. A hall or registrar is passed through. A city with no hall place is passed as `place: 'city'`, not defaulted to hall. Any other kind returns `place`. `fort_humans` and `obsidian_tower`, plus the racial sites `forest_city`, `dwarf_fortress`, `troll_refuge`, `ogre_camp`, `ash_spire`, and `goblin_workshop`, record `place: "hall"`. Each has a linked hub (`${id}_hall`, kind `hub`, role `hall`, place `hall`, edge length 1) set one step off the cardinal road so an east step from the human fort still reaches `edge_light`. Neutral cities such as `plains_market` stay a bare city. Verified: `registerAtHall`, `registrationPlace`, `geographyFrom`.

## Extra system

**Contract board** (artifact 16 §8), domain `postContract`. `POST /contract` is `contract_post` → `postBoardContract` → `postContract`. The poster must be standing on a city or a hub. Kill orders with `targetLevel < 10` or `targetIsMember === true` return `target`. `rewardGold <= 0` returns `gold`. Types are `kill`, `steal`, `smuggle`, `defend`, and `scout`. The row stores `anonymous` when asked. `countedInQuests` is false, and the route does not call `postGuildQuest`. `visibleContracts` shows a kill bounty only to the ordering guild, or to the solo poster when there is no guild. Other types stay on the board. `statePayload` includes `contracts` for the focus character. `App.tsx` calls `postContractBoard` with type `kill`, reward 100, and target level 10. The artifact says the term is real time and does not give a duration, so rows have no `untilMs` and the tick does not expire them. Verified: `postBoardContract`, `postContract`, `visibleContracts`, `postContractBoard`.

## Not a gate

Section 12 war duration stays a measured score. It is not a declare or settle refusal and it is not leftover implementation work.

## Still open

- The GDD is not complete.
- Contract deadlines have no number in artifact 16 §8.1, so a posted contract does not expire and the tick does not settle it. §8.2 also names resource and relic rewards; `postContract` accepts gold only.
- `falseReportSanction` (artifact 32 §10, mute 24 hours) is only called from `packages/domain/src/moderation.test.ts`. No server or client file calls it.
- `sanctionForCheatStrikes` is only called from that same domain test. No production route bans an account from cheat strikes.
- `encodeAncient` and `decipherAttempt` are only called from `packages/domain/src/ancient.ts` and `ancient.test.ts`. No live route deciphers a fragment.
- `coalitionBank` returns `bank` and is only referenced inside `packages/domain/src/guild.ts`. No live route calls it.
- No Steam listing and no trained GPU weight file. Those were not required.
