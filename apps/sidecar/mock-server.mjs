import { createInterface } from 'node:readline';

/**
 * Deterministic stand-in for the perception sidecar.
 * Ping answers pong. Encode answers a length-896 vector taken from the observation.
 */
const reader = createInterface({ input: process.stdin });
reader.on('line', (line) => {
  let message;
  try {
    message = JSON.parse(line);
  } catch {
    return;
  }
  if (message.type === 'ping') {
    process.stdout.write('{"type":"pong"}\n');
    return;
  }
  if (message.type === 'encode' && Array.isArray(message.observation)) {
    const values = new Array(896).fill(0);
    for (let index = 0; index < message.observation.length && index < values.length; index += 1) {
      const sample = message.observation[index];
      values[index] = typeof sample === 'number' ? sample : 0;
    }
    process.stdout.write(`${JSON.stringify({ type: 'vector', values })}\n`);
  }
});
