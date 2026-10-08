import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export interface SidecarHandle {
  command: string;
  ping: string;
  pong: string;
  started: boolean;
  error: string | null;
  pid: number | null;
  observe(observation: readonly number[]): void;
  stop(): void;
}

/** Command line for the mock perception process. Tests do not spawn it unless `start` is set. */
export function spawnMockSidecar(options?: {
  start?: boolean;
  onPong?: () => void;
  onAction?: (action: string) => void;
}): SidecarHandle {
  const command = 'cargo run --manifest-path apps/sidecar/Cargo.toml';
  const ping = '{"type":"ping"}';
  const pong = '{"type":"pong"}';
  const idle: SidecarHandle = {
    command,
    ping,
    pong,
    started: false,
    error: null,
    pid: null,
    observe() {
      return undefined;
    },
    stop() {
      return undefined;
    },
  };
  if (options?.start !== true) {
    return idle;
  }
  const script = mockScriptPath();
  if (script === null) {
    return { ...idle, error: 'mock sidecar script is absent' };
  }
  let child: ChildProcess;
  try {
    child = spawn(process.execPath, [script], { stdio: ['pipe', 'pipe', 'pipe'] });
  } catch (error) {
    return {
      ...idle,
      error: error instanceof Error ? error.message : 'spawn failed',
    };
  }
  let stopped = false;
  let buffer = '';
  child.stdout?.on('data', (chunk: Buffer | string) => {
    buffer += String(chunk);
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      if (line.includes('"type":"pong"')) {
        options.onPong?.();
      }
      try {
        const message = JSON.parse(line) as { type?: string; action?: string };
        if (message.type === 'action' && typeof message.action === 'string') {
          options.onAction?.(message.action);
        }
      } catch {
        // Partial or non-JSON lines are ignored.
      }
    }
  });
  child.stdin?.write(`${ping}\n`);
  return {
    ...idle,
    started: true,
    pid: child.pid ?? null,
    observe(observation) {
      child.stdin?.write(`${JSON.stringify({ type: 'observe', observation })}\n`);
    },
    stop() {
      if (stopped) {
        return;
      }
      stopped = true;
      child.kill();
    },
  };
}

export function encodeRequest(observation: readonly number[]): string {
  return JSON.stringify({ type: 'encode', observation });
}

function mockScriptPath(): string | null {
  const here = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    join(here, '../../../../apps/sidecar/mock-server.mjs'),
    join(process.cwd(), 'apps/sidecar/mock-server.mjs'),
  ];
  return candidates.find((path) => existsSync(path)) ?? null;
}
