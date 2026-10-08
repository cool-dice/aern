# Independent audit, cycle 11

Date: 2026-10-08. Branch `cursor/implement-codebase-a579`. This file re-reads the production call chain (`main.ts` → `buildApp` → `compose` `tickOnce` / `skipMs`, HTTP `LIVE_ROUTES` / socket `runLive` in `dispatch.ts`, and `App.tsx`). A helper that the tick, the skip, or a live route does not call is not wired.

**Verdict: NOT COMPLETE.** The cycle-10 leftovers listed below now have a production call. Artifact 17 is not finished. Sentences that are targets rather than checks, and rules this pass did not put on a route, are listed under Still open.

Section 12's war-duration row (1–1.5 real hours) is a balance target. The table header is "Целевое значение". The section does not say to refuse a declare or a settle when a war falls outside that band. Section 5 stays the war clock: muster 30 minutes, assault 60, hold up to 10, finish 5 (`WAR_MUSTER_MS`, `WAR_ASSAULT_MS`, `WAR_HOLD_MS`, `WAR_FINISH_MS`). Those phases were not shortened.

## Cycle-10 wiring that still holds

1. **Votes, dissolution, flag strike, and escort destinations are posted from the session.** `App.tsx` calls `castLeaderVote`, `dissolveGuild`, `strikeNode`, and `postMercenary` with `destinationId`. `POST /guild/vote` is `guild_vote`. `POST /guild/dissolve` is `guild_dissolve`. `POST /node/strike` is `node_strike`. `POST /mercenary` is `mercenary`. Verified: `castLeaderVote`, `dissolveGuild`, `strikeNode`, `postMercenary`.

2. **A 24-hour portal lift is honored by `askHostilePortal`.** `tickOnce` and `skipMs` call `refreshPortalLifts` → `reviewSection11`, which writes `abuse.portalsLifted`. `cityServiceAccess` passes that list into `askHostilePortal`. `PORTAL_BLOCK_MS` is 24 hours. Verified: `refreshPortalLifts`, `reviewSection11`, `askHostilePortal`.

3. **One vote per character. An AI votes only while the carrier is online, and only on the vote route.** `castLeaderBallot` and `castInternalBallot` return `stuffed` when that `voterId` is already stored, and `offline` for a bot whose entity is not `phase === 'online'` or has `carrierOffline`. The ballot is not stored. Neither function calls `reviewSection11`. Verified: `castLeaderBallot`, `castInternalBallot`.

4. **A multibox carrier is refused before a war is saved or charged.** `guildWar` calls `carrierBlocked` before `declareNeutralCity` and before `ports.guild.declareWar`. Verified: `carrierBlocked`, `guildWar`, `declareNeutralCity`.

5. **Section 12 is measured by `measureSection12`.** `tickOnce` and `skipMs` call `sampleBalance` → `measureSection12`. The function scores bands. It does not return a refusal. Verified: `measureSection12`, `sampleBalance`.

6. **`main.ts` still ticks every 100ms** with `void built.tickOnce()`.

## Wired this cycle

1. **Section 3.3 internal ballots last 24 hours. The leader breaks a tie. The senior council does it when the leader has been absent more than 24 hours.** `POST /guild/vote` with `choice` is `castLeaderBallot` → `castInternalBallot`. That function stores the ballot and does not call `closeInternalVote`. `tickOnce` and `skipMs` call `resolveInternalPolls` → `closeInternalVote` only when `nowMs >= openedAtMs + INTERNAL_VOTE_MS` (24 hours). Quorum is `voteQuorum` (half of the members whose rank is not novice). A strict majority returns `by: 'majority'`. Otherwise the decider is the leader, or `seniorCouncil` when `leaderAbsentMs > DECIDING_ABSENCE_MS`. `finishLeaderPoll` passes `rankRecord` into `castLeaderVote`. `guildCreate` calls `seatCharter` (leader, other founders veteran) and does not call `seatFounders`. `finishLeaderPoll` calls `seatFounders` after a closed election, which is `founderRanks` (leader, everyone else novice). The creation tie still waits `REVOTE_MS` and `resolveLeaderPolls` sets `revote` so the second tie uses `voteRng`. Verified: `castInternalBallot`, `resolveInternalPolls`, `closeInternalVote`, `voteQuorum`, `seniorCouncil`, `finishLeaderPoll`, `castLeaderVote`, `seatCharter`, `seatFounders`, `founderRanks`, `resolveLeaderPolls`.

2. **Section 2.5 moves the seat after 14 days, or dissolves the guild.** `LEADER_ABSENCE_MS` is 14 days. `tickOnce` calls `relieveAbsentLeaders(SIM_TICK_MS)`. `skipMs` calls `relieveAbsentLeaders(ms)`. Both call `noteMemberPresence`, then `succeedAbsentLeader`. A council member with the greatest seniority, then activity, receives `transferLeader`. With no council, the officer with the greatest seniority does. With neither, `payDissolution` runs. An online leader refreshes `leaderSeenAt`, so a long skip while that leader is online does not dissolve the guild. Verified: `relieveAbsentLeaders`, `noteMemberPresence`, `succeedAbsentLeader`, `transferLeader`, `payDissolution`.

3. **Dissolution splits gold, resources, and items from contribution ledgers.** `depositGuild` records gold in `contributions`, resources in `resourceLedgers` / `guildResources`, and items in `itemLedgers` / `guildItems`. `dissolveGuild` and the absence path call `payDissolution` → `dissolveShares` for the gold payout and `dissolveHoldings` for the three ledgers. Gold is `creditGold`. Resources are `creditMaterial` as `metal`. Items are `giveItems` from the bank stacks. Remainders are `dissolutionVoid`, `dissolutionResourceVoid`, and `dissolutionItemVoid`. Verified: `depositGuild`, `dissolveGuild`, `payDissolution`, `dissolveShares`, `dissolveHoldings`, `creditGold`, `creditMaterial`, `giveItems`.

4. **One carrier, one bot is refused when the guild is created and when a second bot joins.** `guildCreate` calls `carriersBlocked` before `ports.guild.create`. `POST /guild/join` is `guild_join` → `joinGuild`, which calls `carriersBlockedIds` before `saveGuild`. `guildWar` / `carrierBlocked` still refuse before a war is saved or charged. Verified: `carriersBlocked`, `carriersBlockedIds`, `guildCreate`, `joinGuild`, `carrierBlocked`.

5. **A stored vote is the vote route's record.** `section11For` calls `storedBallots`, which reads `leaderPolls` and `internalPolls` only. It does not invent a ballot for every bot. `reviewSection11` still classifies `stuffed` and `offline` on the ballots it is given. That note is not a second ballot, and the vote route does not call it. Verified: `storedBallots`, `section11For`, `reviewSection11`.

6. **A reward freeze ends when the later review runs, and a released hold is paid to the wallet.** Artifact 17 §11 says rewards stay frozen "до проверки". It does not name a duration. Artifact 32's 24 hours is a report window, and its 30 days is a collusion ban, so neither number was used as a freeze length. `rewardFreezeEnds` is `nowMs > frozenAtMs`. The opening timestamp does not clear the set. `tickOnce` and `skipMs` both call `inspectRewardFreezes`. A cleared guild is deleted from `frozenGuilds`, then `releaseHeldWithdrawals` calls `guild.service.withdraw` and `creditWithdrawal` (`creditGold`, materials, items). The hold is not only deleted from the bank. Verified: `rewardFreezeEnds`, `inspectRewardFreezes`, `releaseHeldWithdrawals`, `creditWithdrawal`, `holdWithdrawal`.

7. **Section 8.3 lets a guild that does not own the node strike the flag and pocket the chest.** `strikeNodeFlag` returns `owner` when the node has no flag or the caller id is empty. It does not require `node.guildId === guildId`. Rank must still be leader, council, or officer. `POST /node/strike` → `strikeNode` → `strikeNodeFlag`, then `creditGuildVault` for the caller's guild. An absence drop still uses `settleNodeDrop` and leaves the chest. Verified: `strikeNodeFlag`, `strikeNode`, `creditGuildVault`, `settleNodeDrop`.

8. **`skipMs` calls the same jumped-time hooks as `tickOnce`.** Both call `openWarFronts`, `resolveLeaderPolls`, `resolveInternalPolls`, `relieveAbsentLeaders`, `inspectRewardFreezes`, `refreshPortalLifts`, and `sampleBalance`. `skipMs` assigns the `openWarFronts` result onto `simWorld.warFronts`. Verified: `skipMs`, `tickOnce`, `openWarFronts`, `resolveLeaderPolls`, `resolveInternalPolls`, `relieveAbsentLeaders`, `inspectRewardFreezes`, `refreshPortalLifts`, `sampleBalance`.

9. **The charter stores an emblem and a description. Withdrawal caps and a single AI leadership post are enforced.** `createGuild` keeps `emblem` and `description` (default `''`). `GuildService.create` saves them. `copyGuild` copies them. Prisma `charterOf` reads them from the guild-bank JSON. `guildWithdraw` passes `bankLimits` into `withdraw`: daily gold, resource stock and amount against `WITHDRAW_PERCENT`, item amount against `WITHDRAW_ITEMS`, and `itemSlots` against `GUILD_BANK_SLOTS` (500). `depositGuild` calls `reserveItemSlots` before an item stack is added. A passing withdraw calls `creditWithdrawal`. `leadershipBlocked` runs in `guildCreate` before `ports.guild.create`. `seatMember` calls `aiLeadership`. Leadership ranks are leader, council, and officer. A second post returns `limit`. Verified: `createGuild`, `charterOf`, `copyGuild`, `withdraw`, `bankLimits`, `reserveItemSlots`, `guildWithdraw`, `creditWithdrawal`, `aiLeadership`, `leadershipBlocked`, `leadershipPosts`, `seatMember`.

## Still open

- The GDD is not complete.
- Section 12's 1–1.5 hour war-duration row is a balance target, not a gate. `measureSection12` can report `onTarget: false`. It does not block declare or settle. Section 5 phases were not retuned.
- Artifact 17 §11 names no freeze duration. The freeze ends on the next `inspectRewardFreezes` after the opening timestamp (`tickOnce` or `skipMs`). There is no separate reviewer queue and no multi-day investigation hold.
- Section 2.3 name moderation, beyond `NAME_PATTERN` and `OFFICE_COOLDOWN_MS`, is not a create check. An active collusion or alt-guild ban does not refuse `guildCreate` on its own.
- Section 2.2 step 2 (every founder confirms) and the city-hall registration place are not checks. Emblem and description are stored when the guild is created, before the leader poll closes. Starting novice ranks wait until `finishLeaderPoll`.
- Section 3.3 says internal votes run through the guild interface. The live route is `POST /guild/vote` with `choice`. `App.tsx` posts a leader `candidateId`, dissolution, flag strike, and an escort destination. It does not post an internal `choice` or an emblem.
- Resource contributions are one stock. Dissolution and withdrawal credit that stock as `metal`. Item shares walk bank stacks in stored order.
- Section 8.7 (a leader or council member posts a guild quest paid from the bank) has no production function. A search of `apps/server/src` found no guild-quest caller.
- No Steam listing and no trained GPU weight file. Those were not required.
