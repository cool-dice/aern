import { advanceHold, holdWins } from '@rift/domain/guild';

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
}

/**
 * One tick of a city flag. The guild standing alone on the city holds it.
 * Two guilds, or none, drop the flag and the continuous timer returns to 0.
 * Ten continuous minutes (`holdWins`) takes the city.
 */
export function tickCaptures(input: {
  holds: readonly CaptureHold[];
  wars: readonly { cityId: string; startsAtMs: number }[];
  nowMs: number;
  deltaMs: number;
  present: readonly { cityId: string; guildId: string }[];
}): CaptureHold[] {
  const next: CaptureHold[] = [];
  for (const war of input.wars) {
    if (war.startsAtMs > input.nowMs) {
      continue;
    }
    const guilds = new Set(
      input.present.filter((row) => row.cityId === war.cityId).map((row) => row.guildId),
    );
    const holder = guilds.size === 1 ? [...guilds][0] ?? null : null;
    const previous = input.holds.find((row) => row.cityId === war.cityId);
    const advanced = advanceHold({
      holderGuildId: holder,
      previousHolderGuildId: previous?.guildId ?? null,
      heldMs: previous?.won === true ? previous.heldMs : (previous?.heldMs ?? 0),
      deltaMs: input.deltaMs,
    });
    const already = previous?.won === true;
    const won = already || holdWins(advanced.heldMs);
    const wonAtMs = won
      ? previous?.won === true
        ? previous.wonAtMs
        : input.nowMs
      : undefined;
    next.push({
      cityId: war.cityId,
      guildId: won ? (previous?.won === true ? previous.guildId : advanced.holderGuildId) : advanced.holderGuildId,
      heldMs: won && previous?.won === true ? previous.heldMs : advanced.heldMs,
      won,
      ...(wonAtMs !== undefined ? { wonAtMs } : {}),
    });
  }
  return next;
}
