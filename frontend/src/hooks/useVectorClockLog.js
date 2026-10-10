import { useEffect, useRef, useState } from 'react'
import { cloneClock, compareVectorClocks, incrementClock, mergeClocks } from '../sync/vectorClock.js'
import { isRemoteUpdateOrigin } from '../sync/originUtils.js'

const MAX_LOG_ENTRIES = 60
// Side-channel awareness field used for vector clocks. Kept separate from
// the `user` field (Part 1's presence data) and other Part 2 fields so the
// message boundary between "document sync", "presence", and "system
// coordination" stays obvious in the awareness state object.
const AWARENESS_FIELD = 'vc'

let nextLogId = 1

/**
 * Tracks per-peer vector clocks and a rolling log of edit operations for
 * the debug/demo panel. Broadcasts strictly over Yjs's Awareness protocol
 * (message type 1 in y-webrtc), never over the Y.Doc sync protocol (type 0)
 * that Editor.jsx/Part 1 relies on — so this cannot perturb CRDT merging.
 */
export function useVectorClockLog(doc, provider, ready, identity) {
  const [log, setLog] = useState([])
  const clockRef = useRef({})
  const seenRemoteTsRef = useRef(new Map()) // peerId -> last vc timestamp we've already logged
  const lastShownClockRef = useRef(null) // clock of the most recently appended log entry, for "relation to previous"

  useEffect(() => {
    if (!ready) return
    const localPeerId = String(doc.clientID)

    const appendEntry = (peerId, peerName, clock, timestamp) => {
      const relation = lastShownClockRef.current
        ? compareVectorClocks(clock, lastShownClockRef.current)
        : 'equal'
      lastShownClockRef.current = cloneClock(clock)
      const entry = {
        id: nextLogId++,
        peerId,
        peerName,
        timestamp,
        clock: cloneClock(clock),
        relation
      }
      setLog((current) => [entry, ...current].slice(0, MAX_LOG_ENTRIES))
    }

    const onDocUpdate = (_update, origin) => {
      if (isRemoteUpdateOrigin(origin, provider)) return // remote edit — handled via awareness broadcast below, not here
      const nextClock = incrementClock(clockRef.current, localPeerId)
      clockRef.current = nextClock
      const timestamp = Date.now()
      provider.awareness.setLocalStateField(AWARENESS_FIELD, { clock: nextClock, ts: timestamp })
      appendEntry(localPeerId, identity.name, nextClock, timestamp)
    }

    const onAwarenessChange = ({ added, updated }) => {
      const changed = [...added, ...updated]
      const states = provider.awareness.getStates()
      changed.forEach((clientId) => {
        if (clientId === doc.clientID) return // our own broadcast, already logged locally
        const state = states.get(clientId)
        const vc = state?.vc
        if (!vc) return
        const peerId = String(clientId)
        if (seenRemoteTsRef.current.get(peerId) === vc.ts) return // dedupe re-broadcasts of an unchanged state
        seenRemoteTsRef.current.set(peerId, vc.ts)
        clockRef.current = mergeClocks(clockRef.current, vc.clock)
        appendEntry(peerId, state.user?.name || `Peer ${peerId}`, vc.clock, vc.ts)
      })
    }

    doc.on('update', onDocUpdate)
    provider.awareness.on('change', onAwarenessChange)
    return () => {
      doc.off('update', onDocUpdate)
      provider.awareness.off('change', onAwarenessChange)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc, provider, ready])

  return { log }
}
