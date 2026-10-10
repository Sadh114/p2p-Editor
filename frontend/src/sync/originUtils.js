/**
 * y-webrtc applies every remote Yjs update via `Y.applyUpdate(doc, update, room)`
 * (see y-webrtc's readSyncMessage call), so a Y.Doc 'update' event's `origin`
 * is the provider's internal Room instance for remote edits, and something
 * else (undefined, for y-quill's transactions) for local edits. This lets
 * Part 2's hooks distinguish "I typed this" from "a peer's edit arrived"
 * without touching Yjs's sync wire format at all.
 */
export function isRemoteUpdateOrigin(origin, provider) {
  return !!provider?.room && origin === provider.room
}
