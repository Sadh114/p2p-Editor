/**
 * Shows every peer currently sharing awareness state in this room (i.e.
 * every browser tab with an open WebRTC/awareness connection to us right
 * now — including ourselves). Backed entirely by y-webrtc's built-in
 * awareness protocol (from `y-protocols/awareness`, bundled with yjs);
 * this component just renders whatever `useYjsRoom` already derived from
 * `provider.awareness.on('change', ...)`. The avatar/class/level flourishes
 * below are cosmetic only — the underlying data is just {name, color}.
 *
 * Joins/leaves reflect live within a couple seconds because awareness
 * state is removed automatically when a peer's connection drops (either
 * on clean disconnect or after a short timeout for an unclean one).
 */
export default function PresencePanel({ peers }) {
  return (
    <aside className="presence-panel">
      <h2>Party ({peers.length})</h2>
      <ul>
        {peers.map((peer) => (
          <li key={peer.clientId} className="party-member" style={{ '--peer-color': peer.color }}>
            <span className="peer-avatar">{peer.avatar || '🧝'}</span>
            <span className="peer-info">
              <span className="peer-name">
                {peer.name}
                {peer.self ? <span className="peer-you-tag">YOU</span> : null}
              </span>
              <span className="peer-class">{peer.className || 'Adventurer'}</span>
            </span>
          </li>
        ))}
      </ul>
    </aside>
  )
}
