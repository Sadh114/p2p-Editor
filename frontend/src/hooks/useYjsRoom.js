import { useEffect, useState } from 'react'
import * as Y from 'yjs'
import { WebrtcProvider } from 'y-webrtc'
import { IndexeddbPersistence } from 'y-indexeddb'

const SIGNALING_URL = import.meta.env.VITE_SIGNALING_URL || 'ws://localhost:4444'

// How long we wait, after mount, for either (a) the signaling websocket to
// connect or (b) a direct WebRTC peer connection to appear, before we
// surface a visible "error" state instead of sitting on "Connecting..."
// forever. This is a heuristic — y-webrtc does not expose a single
// "handshake failed" event — see README/ARCHITECTURE for the caveat.
const CONNECT_TIMEOUT_MS = 8000

/**
 * Owns the full Yjs sync stack for one room:
 *   - Y.Doc: the CRDT document itself (in-memory, replicated across peers)
 *   - IndexeddbPersistence: LOCAL-ONLY disk cache so a tab refresh doesn't
 *     lose unsynced edits. This is not distributed storage — it never
 *     leaves the browser.
 *   - WebrtcProvider: talks to the signaling server ONLY to discover peers
 *     and exchange WebRTC handshake data (see signaling-server/server.js
 *     for the detailed boundary explanation). Once a data channel is open,
 *     this provider pushes/receives Yjs update messages directly over that
 *     channel — no server involved from that point on for a given pair of
 *     already-connected peers.
 *
 * IMPORTANT: mount a component using this hook with `key={roomId}` at the
 * call site so that changing rooms fully tears down and recreates the Yjs
 * stack, rather than trying to mutate it in place.
 */
export function useYjsRoom(roomId, identity) {
  // Lazy-initialized once per mount (per roomId, given the `key` contract
  // above) so `doc`/`provider` are stable, render-visible values instead
  // of living only in a ref that React wouldn't re-render on.
  const [doc] = useState(() => new Y.Doc())
  const [persistence] = useState(() => new IndexeddbPersistence(`p2p-editor-${roomId}`, doc))
  const [provider] = useState(
    () =>
      new WebrtcProvider(roomId, doc, {
        signaling: [SIGNALING_URL],
        peerOpts: {
          config: {
            // Google's public STUN server — sufficient for NAT traversal
            // on a shared local network / most home networks. No TURN
            // server: if both peers are behind restrictive/symmetric NATs
            // (common on some corporate/campus Wi-Fi), the direct
            // connection can fail. That failure surfaces as the
            // "disconnected"/"error" status below rather than hanging
            // silently.
            iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
          }
        }
      })
  )

  const [status, setStatus] = useState('connecting') // connecting | connected | disconnected | error
  const [peers, setPeers] = useState([])
  const [ready, setReady] = useState(false)

  useEffect(() => {
    provider.awareness.setLocalStateField('user', identity)

    let signalingConnected = false
    let activePeerCount = 0
    let timedOut = false

    const recomputeStatus = () => {
      if (activePeerCount > 0) {
        setStatus('connected')
      } else if (timedOut) {
        setStatus(signalingConnected ? 'connecting' : 'error')
      } else {
        setStatus('connecting')
      }
    }

    const onWsStatus = ({ connected }) => {
      signalingConnected = connected
      recomputeStatus()
    }

    // y-webrtc reports two kinds of active peer: `webrtcPeers` (a real
    // RTCPeerConnection/data channel — what a genuine cross-device P2P
    // link uses) and `bcPeers` (peers in the SAME browser, connected via
    // the BroadcastChannel API as a same-origin fast path instead of a
    // full WebRTC handshake — this is what you'll see when testing with
    // two tabs on one machine). Both mean "actively syncing", so both
    // count as "connected" here; only `webrtcPeers` reflects a true
    // cross-device WebRTC connection.
    const onPeers = ({ webrtcPeers, bcPeers }) => {
      activePeerCount = webrtcPeers.length + bcPeers.length
      recomputeStatus()
    }

    const onAwarenessChange = () => {
      const states = provider.awareness.getStates()
      const list = []
      states.forEach((state, clientId) => {
        if (state && state.user) {
          list.push({
            clientId,
            name: state.user.name,
            color: state.user.color,
            avatar: state.user.avatar,
            className: state.user.className,
            self: clientId === doc.clientID
          })
        }
      })
      setPeers(list)
    }

    provider.on('status', onWsStatus)
    provider.on('peers', onPeers)
    provider.awareness.on('change', onAwarenessChange)
    onAwarenessChange() // seed with our own identity immediately

    // WebrtcProvider.connect() runs off a resolved-promise microtask, which
    // flushes before this effect's `provider.on('peers', ...)` subscription
    // above — so if peers are already in the room when we join, their
    // initial 'peers' event fires before we're listening for it, and we'd
    // otherwise get stuck showing "connecting"/"error" despite already
    // being synced. Read the room's current connection counts directly as
    // a one-time catch-up for whatever the race already missed.
    if (provider.room) {
      activePeerCount = provider.room.webrtcConns.size + provider.room.bcConns.size
      recomputeStatus()
    }

    const onPersistenceSynced = () => setReady(true)
    persistence.once('synced', onPersistenceSynced)

    const timeoutId = setTimeout(() => {
      timedOut = true
      recomputeStatus()
    }, CONNECT_TIMEOUT_MS)

    return () => {
      clearTimeout(timeoutId)
      provider.off('status', onWsStatus)
      provider.off('peers', onPeers)
      provider.awareness.off('change', onAwarenessChange)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [provider, persistence])

  // Full teardown on unmount only (roomId changes remount via `key`).
  useEffect(() => {
    return () => {
      provider.awareness.setLocalState(null)
      provider.destroy()
      persistence.destroy()
      doc.destroy()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return { doc, provider, status, peers, ready }
}
