export interface MetricsSnapshot {
  ticks: number;
  rejected: number;
  players: number;
  bots: number;
}

/** Prometheus text. No external scraper is started. */
export function renderMetrics(snapshot: MetricsSnapshot): string {
  return [
    '# TYPE rift_tick_total counter',
    `rift_tick_total ${formatMetric(snapshot.ticks)}`,
    '# TYPE rift_commands_rejected_total counter',
    `rift_commands_rejected_total ${formatMetric(snapshot.rejected)}`,
    '# TYPE rift_online_players gauge',
    `rift_online_players ${formatMetric(snapshot.players)}`,
    '# TYPE rift_online_bots gauge',
    `rift_online_bots ${formatMetric(snapshot.bots)}`,
    '',
  ].join('\n');
}

function formatMetric(value: number): string {
  if (!Number.isFinite(value)) {
    return '0';
  }
  return String(value);
}
