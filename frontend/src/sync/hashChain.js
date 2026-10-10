/**
 * Hash-chain audit log primitives for Part 2 / Unit 4 (Emerging Paradigms).
 *
 * Each entry: { index, timestamp, eventType, data, prevHash, hash } where
 *   hash = SHA256(index + timestamp + eventType + JSON(data) + prevHash)
 *
 * We use the browser's native Web Crypto SubtleCrypto API (crypto.subtle) —
 * it's already available in every environment Vite targets, so it avoids
 * pulling in a crypto library just for one hash function. This gives
 * tamper-evidence (any edit to an entry's fields changes its hash, breaking
 * every hash that links to it) without the consensus/mining machinery of a
 * real blockchain, which isn't needed here: there's a single coordinator
 * appending entries (no competing writers to arbitrate between), so we only
 * need integrity, not distributed agreement on ordering.
 */

async function sha256Hex(input) {
  const bytes = new TextEncoder().encode(input)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

function entryPayload({ index, timestamp, eventType, data, prevHash }) {
  return `${index}|${timestamp}|${eventType}|${JSON.stringify(data)}|${prevHash}`
}

export async function computeEntryHash(entryFields) {
  return sha256Hex(entryPayload(entryFields))
}

/** Builds a fully-formed, hashed entry. `timestamp` is injectable for the deterministic genesis entry. */
export async function createEntry({ index, eventType, data, prevHash, timestamp = Date.now() }) {
  const fields = { index, timestamp, eventType, data, prevHash }
  const hash = await computeEntryHash(fields)
  return { ...fields, hash }
}

/** The fixed, deterministic first block — identical on every peer, so the chain roots match without any network round-trip. */
export function genesisEntry() {
  return {
    index: 0,
    timestamp: 0,
    eventType: 'genesis',
    data: { note: 'SyncQuest audit chain genesis block' },
    prevHash: '0'.repeat(64),
    hash: '0'.repeat(63) + '1' // fixed sentinel hash, never recomputed/verified against SHA256 (see verifyChain)
  }
}

/**
 * Verifies every entry's own hash and its link to the previous entry's hash.
 * Returns { valid: boolean, results: [{index, hashValid, linkValid, valid}] }.
 * The genesis entry (index 0) is always treated as valid — it's a fixed
 * sentinel, not a real SHA256 output — so verification starts at index 1.
 */
export async function verifyChain(chain) {
  const results = []
  for (let i = 0; i < chain.length; i++) {
    const entry = chain[i]
    if (i === 0) {
      results.push({ index: 0, hashValid: true, linkValid: true, valid: true })
      continue
    }
    const expectedHash = await computeEntryHash(entry)
    const hashValid = expectedHash === entry.hash
    const linkValid = entry.prevHash === chain[i - 1].hash
    results.push({ index: entry.index, hashValid, linkValid, valid: hashValid && linkValid })
  }
  return { valid: results.every((r) => r.valid), results }
}

export function truncateHash(hash) {
  if (!hash) return ''
  return `${hash.slice(0, 8)}…${hash.slice(-6)}`
}
