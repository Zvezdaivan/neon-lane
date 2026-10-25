/**
 * DTLS fingerprint "safety code" for a P2P pair (same idea as Signal's safety
 * number). Every WebRTC data channel runs over DTLS; each side's certificate
 * fingerprint travels inside the SDP, i.e. through the signaling server. A
 * malicious relay could swap both fingerprints and sit in the middle. Both
 * players see the SAME short code only when each one's view of "my cert" and
 * "your cert" matches the other's — comparing it out-of-band (voice, in
 * person, another chat) detects that swap.
 */

export interface Fingerprint {
  algorithm: string;
  value: string;
}

/** Lower-case algorithm, upper-case colon-separated hex — the SDP canonical form. */
export function normalizeFingerprint(fp: Fingerprint): Fingerprint {
  const hex = fp.value.replace(/[^0-9a-f]/gi, "").toUpperCase();
  return {
    algorithm: fp.algorithm.trim().toLowerCase(),
    value: hex.match(/.{1,2}/g)?.join(":") ?? "",
  };
}

/** All `a=fingerprint:` lines in an SDP (session- or media-level). */
export function parseSdpFingerprints(sdp: string | undefined | null): Fingerprint[] {
  if (!sdp) return [];
  const out: Fingerprint[] = [];
  const seen = new Set<string>();
  for (const line of sdp.split(/\r?\n/)) {
    const m = /^a=fingerprint:(\S+)\s+([0-9A-Fa-f:]+)\s*$/.exec(line.trim());
    if (!m) continue;
    const fp = normalizeFingerprint({ algorithm: m[1], value: m[2] });
    const key = `${fp.algorithm} ${fp.value}`;
    if (!seen.has(key)) {
      seen.add(key);
      out.push(fp);
    }
  }
  return out;
}

/** Child-friendly symbols for the visual half of the code (64 entries = 6 bits). */
export const SAFETY_EMOJI = [
  "🍎", "🍌", "🍇", "🍓", "🍒", "🍑", "🍍", "🥝", "🥕", "🌽", "🍄", "🥨", "🧀", "🍪", "🍩", "🧁",
  "🐶", "🐱", "🐭", "🐰", "🦊", "🐻", "🐼", "🐨", "🐯", "🦁", "🐮", "🐷", "🐸", "🐵", "🐔", "🐧",
  "🐢", "🐙", "🦀", "🐳", "🐬", "🦋", "🐝", "🐞", "🌵", "🌲", "🌻", "🌈", "⭐", "🌙", "☀️", "❄️",
  "⚽", "🏀", "🎈", "🎁", "🎵", "🎨", "🚗", "🚲", "🚀", "⛵", "🏰", "👑", "🔔", "🎩", "🧸", "🪁",
];

export interface SafetyCode {
  /** "1234 5678 9012" */
  digits: string;
  /** Four emoji derived from the same hash. */
  emoji: string;
}

/**
 * SHA-256 over both fingerprints sorted lexicographically, so the two sides of
 * a pair (local/remote swapped) compute identical bytes. Domain-separated and
 * versioned so the code can evolve without colliding with older builds.
 */
export async function computeSafetyCode(a: Fingerprint, b: Fingerprint): Promise<SafetyCode> {
  const parts = [normalizeFingerprint(a), normalizeFingerprint(b)]
    .map((fp) => `${fp.algorithm} ${fp.value}`)
    .sort();
  const input = new TextEncoder().encode(`neon-lane-safety-v1\n${parts[0]}\n${parts[1]}`);
  const hash = new Uint8Array(await crypto.subtle.digest("SHA-256", input));
  // 12 decimal digits from 3 × 32-bit words (mod 10^4 each; bias is negligible).
  const groups: string[] = [];
  for (let i = 0; i < 3; i++) {
    const word = ((hash[i * 4] << 24) | (hash[i * 4 + 1] << 16) | (hash[i * 4 + 2] << 8) | hash[i * 4 + 3]) >>> 0;
    groups.push(String(word % 10_000).padStart(4, "0"));
  }
  const emoji = [12, 13, 14, 15].map((i) => SAFETY_EMOJI[hash[i] & 63]).join("");
  return { digits: groups.join(" "), emoji };
}
