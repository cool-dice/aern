/** Command line for the mock perception process. Tests do not spawn it. */
export function spawnMockSidecar(): { command: string; ping: string; pong: string } {
  return {
    command: 'cargo run --manifest-path apps/sidecar/Cargo.toml',
    ping: '{"type":"ping"}',
    pong: '{"type":"pong"}',
  };
}

export function encodeRequest(observation: readonly number[]): string {
  return JSON.stringify({ type: 'encode', observation });
}
