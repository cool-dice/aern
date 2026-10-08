import {
  advanceHold,
  assaultWindowMs,
  holdWins,
  settleWar,
  warPhase,
  warWinner,
  type WarOutcome,
} from '@rift/domain/guild';

export function readCaptures(value: unknown): CaptureHold[] {
  if (typeof value !== 'object' || value === null || !('captures' in value)) {
    return [];
  }
  const rows = (value as { captures?: unknown }).captures;
  if (!Array.isArray(rows)) {
    return [];
  }
  const holds: CaptureHold[] = [];
  for (const row of rows) {
    if (typeof row !== 'object' || row === null) {
      continue;
    }
    const hold = row as {
      cityId?: unknown;
      guildId?: unknown;
      heldMs?: unknown;
      won?: unknown;
      wonAtMs?: unknown;
      drawEndedAtMs?: unknown;
      settled?: unknown;
      ownerGuildId?: unknown;
    };
    if (typeof hold.cityId !== 'string' || typeof hold.heldMs !== 'number') {
      continue;
    }
    holds.push({
      cityId: hold.cityId,
      guildId: typeof hold.guildId === 'string' ? hold.guildId : null,
      heldMs: hold.heldMs,
      won: hold.won === true,
      ...(typeof hold.wonAtMs === 'number' ? { wonAtMs: hold.wonAtMs } : {}),
      ...(typeof hold.drawEndedAtMs === 'number' ? { drawEndedAtMs: hold.drawEndedAtMs } : {}),
      ...(hold.settled === true ? { settled: true } : {}),
      ...(typeof hold.ownerGuildId === 'string' || hold.ownerGuildId === null
        ? { ownerGuildId: hold.ownerGuildId }
        : {}),
    });
  }
  return holds;
}

export interface CaptureHold {
  cityId: string;
  guildId: string | null;
  heldMs: number;
  won: boolean;
  /** Sim time when this guild first won the city. Griefing lift counts from here. */
  wonAtMs?: number;
  /** Set when `settleWar` records a draw. The next war for this city waits 3 days. */
  drawEndedAtMs?: number;
  /** This war has already called `settleWar`. Later ticks keep the row. */
  settled?: boolean;
  /** Owner before this war. A draw keeps this guild. */
  ownerGuildId?: string | null;
}

export interface CapturePresent {
  cityId: string;
  guildId: string;
  /** A hired mercenary can fight and cannot take the city. */
  mercenary?: boolean;
}

/**
 * One tick of every open city war.
 * Muster does not award a 10-minute hold.
 * Assault calls `warWinner` when the hold reaches 10 minutes.
 * The finish calls `warWinner` and `settleWar`, including a draw.
 * Only contender guilds can take the city.
 */
export function tickCaptures(input: {
  holds: readonly CaptureHold[];
  wars: readonly { id?: string; cityId: string; startsAtMs: number; attackerGuildId?: string }[];
  nowMs: number;
  deltaMs: number;
  present: readonly CapturePresent[];
  contenders?: readonly { cityId: string; guildId: string; warId?: string }[];
  guardsRemaining?: readonly { cityId: string; remaining: number }[];
}): CaptureHold[] {
  const rows = new Map<string, CaptureHold>();
  for (const hold of input.holds) {
    rows.set(hold.cityId, hold);
  }
  const latest = new Map<string, (typeof input.wars)[number]>();
  for (const war of input.wars) {
    if (war.startsAtMs > input.nowMs) {
      continue;
    }
    const current = latest.get(war.cityId);
    if (current === undefined || war.startsAtMs >= current.startsAtMs) {
      latest.set(war.cityId, war);
    }
  }
  for (const war of latest.values()) {
    const stored = rows.get(war.cityId);
    const closedAt = stored?.drawEndedAtMs ?? stored?.wonAtMs;
    if (stored?.settled === true && (closedAt === undefined || closedAt >= war.startsAtMs)) {
      continue;
    }
    const previous = stored?.settled === true ? undefined : stored;
    const ownerGuildId =
      stored?.settled === true
        ? (stored.ownerGuildId ?? (stored.won ? stored.guildId : null))
        : (stored?.ownerGuildId ?? (stored?.won === true ? stored.guildId : null));
    const elapsed = Math.max(0, input.nowMs - war.startsAtMs);
    const phase = warPhase(elapsed);
    const guards =
      input.guardsRemaining?.find((row) => row.cityId === war.cityId)?.remaining ?? 0;
    const contenderIds = new Set(
      (input.contenders ?? [])
        .filter((row) => {
          if (row.cityId !== war.cityId) {
            return false;
          }
          if (row.warId === undefined || war.id === undefined) {
            return true;
          }
          return row.warId === war.id;
        })
        .map((row) => row.guildId),
    );
    const claimants = input.present.filter(
      (row) => row.cityId === war.cityId && row.mercenary !== true && contenderIds.has(row.guildId),
    );
    const standingGuilds = new Set(
      input.present
        .filter((row) => row.cityId === war.cityId && row.mercenary !== true)
        .map((row) => row.guildId),
    );
    const sole = standingGuilds.size === 1 ? ([...standingGuilds][0] ?? null) : null;
    const holder = sole !== null && contenderIds.has(sole) ? sole : null;
    const fighters = new Map<string, number>();
    for (const row of claimants) {
      fighters.set(row.guildId, (fighters.get(row.guildId) ?? 0) + 1);
    }
    const guilds = [...fighters.entries()].map(([guildId, count]) => ({ guildId, fighters: count }));

    if (guards > 0 || phase === 'muster') {
      rows.set(war.cityId, {
        cityId: war.cityId,
        guildId: holder,
        heldMs: 0,
        won: false,
        ownerGuildId,
      });
      continue;
    }

    const holdDelta = phase === 'assault' ? assaultWindowMs({
      startsAtMs: war.startsAtMs,
      nowMs: input.nowMs,
      deltaMs: input.deltaMs,
    }) : 0;
    const advanced = advanceHold({
      holderGuildId: holder,
      previousHolderGuildId: previous?.won === true ? null : (previous?.guildId ?? null),
      heldMs: previous?.won === true ? 0 : (previous?.heldMs ?? 0),
      deltaMs: holdDelta,
    });
    const heldLongEnough = phase === 'assault' && holdWins(advanced.heldMs);
    const finishing = phase === 'finish' || phase === 'closed';
    if (!heldLongEnough && !finishing) {
      rows.set(war.cityId, {
        cityId: war.cityId,
        guildId: advanced.holderGuildId,
        heldMs: advanced.heldMs,
        won: false,
        ownerGuildId,
      });
      continue;
    }
    const outcome: WarOutcome = warWinner({
      heldCenterGuildId: heldLongEnough ? advanced.holderGuildId : null,
      heldMs: heldLongEnough ? advanced.heldMs : 0,
      guilds: finishing && !heldLongEnough ? guilds : guilds,
    });
    const settled = settleWar({ outcome, ownerGuildId });
    const won = settled.ownerGuildId !== null && outcome.result === 'win';
    const draw = outcome.result === 'draw';
    rows.set(war.cityId, {
      cityId: war.cityId,
      guildId: won ? settled.ownerGuildId : ownerGuildId,
      heldMs: heldLongEnough ? advanced.heldMs : (previous?.heldMs ?? 0),
      won: won || (draw && ownerGuildId !== null),
      ownerGuildId: draw ? ownerGuildId : settled.ownerGuildId,
      settled: true,
      ...(won ? { wonAtMs: input.nowMs } : {}),
      ...(draw ? { drawEndedAtMs: input.nowMs } : {}),
    });
  }
  return [...rows.values()];
}
