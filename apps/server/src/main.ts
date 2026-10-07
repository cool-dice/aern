import { buildApp } from './compose';

const WORLD_EPOCH_MS = Date.parse('2026-01-01T00:00:00.000Z');

const port = readPort(process.env.PORT);
const built = await buildApp({
  nowMs: readNowMs(process.env.RIFT_NOW_MS),
  contentDir: emptyToUndefined(process.env.RIFT_CONTENT),
  databaseUrl: emptyToUndefined(process.env.DATABASE_URL),
  jwtSecret: emptyToUndefined(process.env.JWT_SECRET) ?? 'rift-dev-jwt-secret',
});

setInterval(() => {
  built.tickOnce();
}, 100);

await built.app.listen({ port, host: '127.0.0.1' });

function readPort(raw: string | undefined): number {
  if (raw === undefined || raw.trim() === '') {
    return 8080;
  }
  const port = Number(raw);
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new Error(`PORT must be an integer from 0 to 65535, got ${raw}`);
  }
  return port;
}

function readNowMs(raw: string | undefined): number {
  if (raw === undefined || raw.trim() === '') {
    return WORLD_EPOCH_MS;
  }
  const nowMs = Number(raw);
  if (!Number.isFinite(nowMs)) {
    throw new Error(`RIFT_NOW_MS must be a finite number, got ${raw}`);
  }
  return nowMs;
}

function emptyToUndefined(raw: string | undefined): string | undefined {
  if (raw === undefined || raw.trim() === '') {
    return undefined;
  }
  return raw;
}
