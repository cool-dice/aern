# Independent audit, cycle 12

Date: 2026-10-08. Branch `cursor/implement-codebase-a579`. This file re-reads the production call chain (`main.ts` → `buildApp` → `compose` `tickOnce` / `skipMs`, HTTP `LIVE_ROUTES` / socket `runLive` in `dispatch.ts`, and `App.tsx`). A helper that the tick, the skip, or a live route does not call is not wired.

**Verdict: NOT COMPLETE.** The six cycle-11 leftovers named below now have a production call. Artifact 17 is not finished. Rules this pass did not put on a route are listed under Still open.

Section 12's war-duration row (1–1.5 real hours) is a balance score from `measureSection12`, not a gate, and it is not still-open work. The table header is "Целевое значение". The section does not say to refuse a declare or a settle when a war falls outside that band. Section 5 stays the war clock: muster 30 minutes, assault 60, hold up to 10, finish 5 (`WAR_MUSTER_MS`, `WAR_ASSAULT_MS`, `WAR_HOLD_MS`, `WAR_FINISH_MS`). Those phases were not shortened. `tickOnce` and `skipMs` call `sampleBalance` → `measureSection12`. The function scores bands. It does not return a refusal. `SECTION12.warDurationMinMs` is 3 600 000 and `warDurationMaxMs` is 5 400 000. `onTarget: false` does not block play.

## Cycle-11 wiring that still holds

1. **A 24-hour internal ballot, a leader deciding vote, a senior-council fallback, and ranks passed into `castLeaderVote`.** `POST /guild/vote` is `guild_vote` → `castLeaderBallot`. A string `choice` goes to `castInternalBallot`, which stores the ballot and does not call `closeInternalVote`. `tickOnce` and `skipMs` call `resolveInternalPolls` → `closeInternalVote` only when `nowMs >= openedAtMs + INTERNAL_VOTE_MS` (24 hours). Quorum is `voteQuorum`. A tie uses the leader, or `seniorCouncil` when `leaderAbsentMs > DECIDING_ABSENCE_MS`. `finishLeaderPoll` passes `rankRecord` into `castLeaderVote`. `guildCreate` calls `seatCharter` and does not call `seatFounders`. Novice ranks still wait until `finishLeaderPoll` → `seatFounders` → `founderRanks`. Verified: `castLeaderBallot`, `castInternalBallot`, `resolveInternalPolls`, `closeInternalVote`, `voteQuorum`, `seniorCouncil`, `finishLeaderPoll`, `castLeaderVote`, `seatCharter`, `seatFounders`, `founderRanks`.

2. **Fourteen days of leader absence transfers the seat or dissolves the guild.** `LEADER_ABSENCE_MS` is 14 days. `tickOnce` calls `relieveAbsentLeaders(SIM_TICK_MS)`. `skipMs` calls `relieveAbsentLeaders(ms)`. Both call `noteMemberPresence`, then `succeedAbsentLeader`. Council seniority and activity use `transferLeader`. With no council, the senior officer does. With neither, `payDissolution` runs. Verified: `relieveAbsentLeaders`, `noteMemberPresence`, `succeedAbsentLeader`, `transferLeader`, `payDissolution`.

3. **One carrier, one bot is refused at create and when a second bot joins.** `guildCreate` calls `carriersBlocked` before `ports.guild.create`. `guild_join` → `joinGuild` calls `carriersBlockedIds` before `saveGuild`. Verified: `carriersBlocked`, `carriersBlockedIds`, `guildCreate`, `joinGuild`.

4. **`withdraw` enforces item-slot and item/resource caps.** `guildWithdraw` passes `bankLimits` into `withdraw` (`WITHDRAW_PERCENT`, `WITHDRAW_ITEMS`, `GUILD_BANK_SLOTS`). `depositGuild` calls `reserveItemSlots`. A passing withdraw calls `creditWithdrawal`. Verified: `withdraw`, `bankLimits`, `reserveItemSlots`, `guildWithdraw`, `creditWithdrawal`.

5. **An AI cannot hold more than one leadership post.** `guildCreate` calls `leadershipBlocked` before `ports.guild.create`. `seatMember` calls `aiLeadership`. A second leader, council, or officer post returns `limit`. Verified: `leadershipBlocked`, `leadershipPosts`, `aiLeadership`, `seatMember`.

6. **`skipMs` calls the same jumped-time hooks as `tickOnce`.** Both call `openWarFronts`, `resolveLeaderPolls`, `resolveInternalPolls`, `relieveAbsentLeaders`, `inspectRewardFreezes`, `refreshPortalLifts`, `sampleBalance`, `tickContracts`, and `tickGuildQuests`. Verified: `skipMs`, `tickOnce`.

7. **`main.ts` still ticks every 100ms** with `void built.tickOnce()`.

## Wired this cycle

1. **A reward freeze lasts until a review. Section 11 names no duration.** `rewardFreezeEnds` returns true only when `reviewedAtMs !== null`, `reviewedAtMs >= frozenAtMs`, and `nowMs >= reviewedAtMs`. A later clock reading with `reviewedAtMs === null` does not clear the freeze. `tickOnce` and `skipMs` call `inspectRewardFreezes`, which keeps an unreviewed row. `POST /guild/review` is `guild_review` → `reviewRewardFreeze` → `acceptRewardReview` (`REVIEWER_ROLES`: `moderator`, `admin`). A player role returns `rank`. On accept, the freeze is removed and `releaseHeldWithdrawals` calls `creditWithdrawal`, which credits the character wallet (`creditGold`, `creditMaterial`, `giveItems`). Verified: `rewardFreezeEnds`, `inspectRewardFreezes`, `reviewRewardFreeze`, `acceptRewardReview`, `releaseHeldWithdrawals`, `creditWithdrawal`.

2. **Guild creation refuses a moderated name, a live office, and an abuse ban.** `guildCreate` calls `screenGuildCreate` → `screenCharter` before `ports.guild.create`. The name check is `textHitsBlacklist` against `GUILD_NAME_BLACKLIST`, separate from `NAME_PATTERN`. `inOffice` or `nowMs - lastOfficeMs < OFFICE_COOLDOWN_MS` (7 days) returns `cooldown`. An active collusion or alt-guild ban returns `ban`. `POST /guild/ban` is `guild_ban` → `banFounder` → `applyCreationBan`. Collusion uses `COLLUSION_BAN_MS` (30 days). Alt-guild uses `untilMs: null`. Verified: `screenGuildCreate`, `screenCharter`, `textHitsBlacklist`, `banFounder`, `applyCreationBan`.

3. **Every founder confirms. Registration is at a city hall. Emblem and description are stored when the leader poll closes.** `guildCreate` calls `confirmFounders` → `foundersConfirmed` and `registerAtHall` → `registrationPlace` before `ports.guild.create`. A founder with `confirmed !== true` returns `confirm`. The initiator must be standing on a node whose kind is `city`; the place is `hall` when omitted, or `city` / `hall` / `registrar`. Anything else returns `place`. The create call passes `emblem: ''` and `description: ''`. `openLeaderPoll` keeps the real strings. `finishLeaderPoll` writes `poll.emblem` and `poll.description` onto the guild when the poll closes, then `seatFounders`. Verified: `confirmFounders`, `foundersConfirmed`, `registerAtHall`, `registrationPlace`, `openLeaderPoll`, `finishLeaderPoll`.

4. **The play session posts an internal ballot `choice` and an emblem.** `App.tsx` calls `castGuildChoice` with `choice: 'yes'` to `POST /guild/vote`, and `postGuildEmblem` to `POST /guild/emblem` (`guild_emblem` → `setCharterEmblem`). While the leader poll is open, `setCharterEmblem` writes the poll and does not save the guild (`stored: false`). `finishLeaderPoll` stores it. A leader or council member may post it; another rank returns `rank`. The session still posts `castLeaderVote`, `dissolveGuild`, `strikeNode`, and `postMercenary` with `destinationId`. Verified: `castGuildChoice`, `postGuildEmblem`, `setCharterEmblem`, `castInternalBallot`.

5. **Resource contributions keep their kinds. Item shares follow the contribution ledger.** `depositGuild` records each `resourceId` on `resourceKindLedgers` / `resourceKindStock` and each `itemId` on `itemKindLedgers`. `payDissolution` still calls `dissolveShares` and `dissolveHoldings`, then `dissolveKindPiles` on `resourceKindPiles` and `itemKindPiles`. Each resource share is `creditMaterial(share.id, pile.kind, share.amount)`. Each item share is `giveItems` of that `itemId`. The payout does not credit every resource as `metal` and does not walk bank stacks with a cursor. A withdrawal moves only the named kind's stock. Verified: `depositGuild`, `payDissolution`, `dissolveShares`, `dissolveHoldings`, `dissolveKindPiles`, `creditMaterial`, `giveItems`.

6. **Section 8.7 guild quests are posted and settled in production.** `POST /guild/quest` is `guild_quest` → `acceptGuildQuest` → `postGuildQuest`. Only a leader or council member can post. The default is the section's example: `PATROL_QUEST_MS` (3 hours) and `PATROL_QUEST_GOLD` (5 000), and the bank is not charged at post time. The quest is on `state().guildQuests` for the viewer's guild (`focus.guildId === quest.guildId`). `tickOnce` and `skipMs` call `tickGuildQuests` → `settleGuildQuest` → `tickContract` with kind `patrol`. Staying on the node for the duration completes it and pays that gold from the guild bank to the assignee. A missed deadline, or a bank that can no longer cover the reward, fails the quest and pays nothing. `App.tsx` calls `postGuildQuest`. Verified: `acceptGuildQuest`, `postGuildQuest`, `tickGuildQuests`, `settleGuildQuest`, `tickContract`.

## Not a gate

Section 12 war duration stays a measured score. It is not a declare/settle refusal and it is not leftover implementation work.

## Still open

- The GDD is not complete.
- `setDoctrine` (section 3.2: changing doctrine needs the council, with `DOCTRINE_COOLDOWN_MS` of 7 days) is only called from `packages/domain/src/guild.test.ts`. No server file calls it. There is no doctrine route.
- Section 4.1 says bank operations are visible to members. `logWithdrawal` appends `bankLog`, and `section11For` passes `bankLog.length` into `reviewSection11` as `withdrawalsLogged`. The log is not on the live state the member reads.
- `guildWithdraw` reads `leaderConfirm`, `councilConfirms`, and `councilVote` for the section 4.2 thresholds (over 10% needs the leader and two council members; over 25% needs a council vote). `App.tsx` `withdrawBank` posts `amount` only, so the play button cannot supply those confirmations.
- Registration is the initiator's current node. A `kind === 'city'` node with place `hall`, `city`, or `registrar` passes `registrationPlace`. The world graph has no separate hall or registrar node, so the check is standing in the city, not inside a building.
- No Steam listing and no trained GPU weight file. Those were not required.
