/**
 * Vector clock primitives for Part 2 / Unit 3 (Synchronization).
 *
 * This is deliberately independent of Yjs's own CRDT conflict resolution
 * (see Editor.jsx for that — Y.Text/YATA already guarantees Strong Eventual
 * Consistency without any of this). Vector clocks here exist purely to make
 * the *causal ordering* between edit operations visible and explainable,
 * which Yjs's internal Lamport-style clocks don't surface to the UI.
 *
 * A vector clock is a plain object: { [peerId]: counter }. peerId is the
 * string form of a peer's Y.Doc clientID (stable for the lifetime of a tab,
 * unique enough across peers for a classroom demo).
 */

export function createEmptyClock() {
  return {}
}

export function cloneClock(clock) {
  return { ...clock }
}

/** Increments the given peer's own counter and returns a new clock object. */
export function incrementClock(clock, peerId) {
  const next = cloneClock(clock)
  next[peerId] = (next[peerId] || 0) + 1
  return next
}

/** Component-wise maximum merge, per standard vector clock rules. */
export function mergeClocks(a, b) {
  const merged = cloneClock(a)
  for (const peerId of Object.keys(b)) {
    merged[peerId] = Math.max(merged[peerId] || 0, b[peerId] || 0)
  }
  return merged
}

/**
 * Compares two vector clocks and returns one of:
 *   "before"     — vc1 happened-before vc2 (vc1 <= vc2 component-wise, strictly less somewhere)
 *   "after"      — vc1 happened-after vc2
 *   "concurrent" — neither happened-before the other (genuine distributed concurrency)
 *   "equal"      — identical on every known peer
 *
 * This is the textbook vector-clock partial-order comparison.
 */
export function compareVectorClocks(vc1, vc2) {
  const peerIds = new Set([...Object.keys(vc1), ...Object.keys(vc2)])
  let vc1LessSomewhere = false
  let vc2LessSomewhere = false

  for (const peerId of peerIds) {
    const c1 = vc1[peerId] || 0
    const c2 = vc2[peerId] || 0
    if (c1 < c2) vc1LessSomewhere = true
    if (c2 < c1) vc2LessSomewhere = true
  }

  if (!vc1LessSomewhere && !vc2LessSomewhere) return 'equal'
  if (vc1LessSomewhere && !vc2LessSomewhere) return 'before'
  if (vc2LessSomewhere && !vc1LessSomewhere) return 'after'
  return 'concurrent'
}
