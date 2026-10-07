import { createHmac, timingSafeEqual } from 'node:crypto';
import { canonicalCommand, type ClientCommand } from '@rift/protocol';

/**
 * HMAC-SHA256 over UTF-8 `canonicalCommand`.
 * The key is the raw bytes of the session key, not the hex characters.
 * Protocol does not sign; this module does.
 */
export function signCommand(command: ClientCommand, sessionKeyHex: string): string {
  const key = decodeHexKey(sessionKeyHex);
  if (key === null) {
    throw new Error('session key must be even-length hex');
  }
  return createHmac('sha256', key).update(canonicalCommand(command), 'utf8').digest('hex');
}

export function commandSignatureMatches(
  command: ClientCommand,
  sessionKeyHex: string,
  signatureHex: string,
): boolean {
  if (!/^[0-9a-fA-F]+$/.test(signatureHex)) {
    return false;
  }
  let expected: string;
  try {
    expected = signCommand(command, sessionKeyHex);
  } catch {
    return false;
  }
  return hexEqual(expected, signatureHex.toLowerCase());
}

function decodeHexKey(sessionKeyHex: string): Buffer | null {
  if (sessionKeyHex.length === 0 || sessionKeyHex.length % 2 !== 0) {
    return null;
  }
  if (!/^[0-9a-fA-F]+$/.test(sessionKeyHex)) {
    return null;
  }
  return Buffer.from(sessionKeyHex, 'hex');
}

function hexEqual(expected: string, provided: string): boolean {
  const left = Buffer.from(expected, 'utf8');
  const right = Buffer.from(provided, 'utf8');
  if (left.length !== right.length) {
    return false;
  }
  return timingSafeEqual(left, right);
}
