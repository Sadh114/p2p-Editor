import { useEffect, useRef, useState } from 'react'

const MAX_LOG_ENTRIES = 60
// Side-channel awareness fields for Part 2's coordination messages — kept
// separate from `user` (Part 1 presence) and `vc` (Feature 1). `priority`
// and `knownCoordinator` are persistent state (last-value-wins, exactly
// what awareness is designed for); `coordMsg` carries one-shot Bully
// protocol messages (ELECTION / ALIVE / COORDINATOR), deduped by (from, seq)
// on the receiving end since awareness periodically re-broadcasts unchanged
// state as a keep-alive.
const FIELD_PRIORITY = 'priority'
const FIELD_MSG = 'coordMsg'
const FIELD_KNOWN_COORDINATOR = 'knownCoordinator'

// Long enough to cover a couple of awareness round-trips over WebRTC even
// with some jitter, short enough that a demo re-election ("close the
// coordinator's tab") visibly resolves within a few seconds.
const ELECTION_TIMEOUT_MS = 2500
// Give the mesh a moment to finish connecting/exchanging awareness state
// before assuming "no coordinator known yet" means one needs electing.
const STARTUP_DEBOUNCE_MS = 1500

let nextLogId = 1

/**
 * Bully algorithm for electing a single "session coordinator" among all
 * connected peers, run entirely over Yjs Awareness broadcasts (never the
 * Y.Doc sync protocol). Priority = each peer's Y.Doc `clientID`: a random
 * uint32 Yjs already assigns per browser tab on creation. We reuse it
 * instead of a join-order timestamp specifically to avoid trusting
 * unsynchronized local clocks for a tie-breaker — clock skew between
 * machines is exactly the kind of thing a distributed systems course would
 * flag as a bug in a "priority = Date.now()" scheme.
 *
 * Classic Bully sends ELECTION only to higher-priority peers and expects a
 * targeted response. Here every peer is already directly reachable via the
 * same WebRTC full mesh Part 1 established (that's what "peers" already
 * means in this app), so we broadcast every message to everyone and have
 * each recipient act only if the message concerns their own priority
 * relative to the sender — behaviorally equivalent to targeted send/receive
 * on a fully-connected topology, without needing a message relay.
 */
export function useCoordinatorElection(doc, provider, ready, identity, peers) {
  const [coordinatorId, setCoordinatorId] = useState(null)
  const [electionLog, setElectionLog] = useState([])
  const [electionInProgress, setElectionInProgress] = useState(false)

  const termRef = useRef(0)
  const seqRef = useRef(0)
  const electionTimeoutRef = useRef(null)
  const processedRef = useRef(new Map()) // peerId -> last seq processed
  const prevPeerIdsRef = useRef(null)
  const coordinatorIdRef = useRef(null)
  const startElectionRef = useRef(() => {})

  const localPeerId = String(doc.clientID)

  const logElection = (message, meta) => {
    setElectionLog((current) =>
      [{ id: nextLogId++, timestamp: Date.now(), message, meta }, ...current].slice(0, MAX_LOG_ENTRIES)
    )
  }

  useEffect(() => {
    if (!ready) return

    provider.awareness.setLocalStateField(FIELD_PRIORITY, doc.clientID)

    const peerName = (peerId) => {
      const state = provider.awareness.getStates().get(Number(peerId))
      return state?.user?.name || `Peer ${peerId}`
    }

    const knownPeerPriorities = () => {
      const list = []
      provider.awareness.getStates().forEach((state, clientId) => {
        if (typeof state?.priority === 'number') {
          list.push({ peerId: String(clientId), priority: state.priority })
        }
      })
      return list
    }

    const clearElectionTimeout = () => {
      if (electionTimeoutRef.current) {
        clearTimeout(electionTimeoutRef.current)
        electionTimeoutRef.current = null
      }
      setElectionInProgress(false)
    }

    const announceCoordinator = (peerId) => {
      coordinatorIdRef.current = peerId
      setCoordinatorId(peerId)
      provider.awareness.setLocalStateField(FIELD_KNOWN_COORDINATOR, { coordinatorId: peerId, term: termRef.current })
    }

    const broadcast = (type, extra = {}) => {
      seqRef.current += 1
      provider.awareness.setLocalStateField(FIELD_MSG, {
        type,
        from: localPeerId,
        term: termRef.current,
        seq: seqRef.current,
        ...extra
      })
      logElection(`${type} sent`, { type, term: termRef.current, ...extra })
    }

    const declareVictory = () => {
      clearElectionTimeout()
      logElection('COORDINATOR announced (self)', { term: termRef.current })
      broadcast('COORDINATOR')
      announceCoordinator(localPeerId)
    }

    const startElection = () => {
      clearElectionTimeout()
      termRef.current += 1
      const higherPeers = knownPeerPriorities().filter((p) => p.priority > doc.clientID)
      logElection('ELECTION started', { term: termRef.current, higherPriorityPeers: higherPeers.length })
      if (higherPeers.length === 0) {
        declareVictory()
        return
      }
      setElectionInProgress(true)
      broadcast('ELECTION')
      electionTimeoutRef.current = setTimeout(declareVictory, ELECTION_TIMEOUT_MS)
    }
    startElectionRef.current = startElection

    const handleMessage = (fromClientId, msg) => {
      const fromPeerId = String(fromClientId)
      if (fromPeerId === localPeerId) return
      const lastSeq = processedRef.current.get(fromPeerId) || 0
      if (msg.seq <= lastSeq) return // already handled, or a stale keep-alive re-broadcast
      processedRef.current.set(fromPeerId, msg.seq)

      const fromPriority = fromClientId // clientID doubles as priority
      const name = peerName(fromPeerId)

      if (msg.type === 'ELECTION') {
        logElection(`ELECTION received from ${name}`, { from: fromPeerId })
        if (doc.clientID > fromPriority) {
          broadcast('ALIVE', { to: fromPeerId })
          // Take over running the election, unless I already won a previous
          // one — otherwise a lower peer's stray/late ELECTION would bounce
          // an already-settled coordinator back into electing itself again.
          if (!electionTimeoutRef.current && coordinatorIdRef.current !== localPeerId) startElection()
        }
      } else if (msg.type === 'ALIVE') {
        if (msg.to === localPeerId) {
          logElection(`response received from ${name}`, { from: fromPeerId })
          clearElectionTimeout() // a higher-priority peer is alive; they'll announce, not me
        }
      } else if (msg.type === 'COORDINATOR') {
        logElection(`COORDINATOR announced: ${name}`, { from: fromPeerId })
        clearElectionTimeout()
        announceCoordinator(fromPeerId)
      }
    }

    const onAwarenessChange = ({ added, updated }) => {
      const states = provider.awareness.getStates()
      ;[...added, ...updated].forEach((clientId) => {
        if (clientId === doc.clientID) return
        const msg = states.get(clientId)?.[FIELD_MSG]
        if (msg) handleMessage(clientId, msg)
      })
    }
    provider.awareness.on('change', onAwarenessChange)

    // On join: adopt an already-known coordinator from any peer's replicated
    // state if one exists; otherwise, after letting the mesh settle, run an
    // election ourselves (every peer does this — whoever's timer/logic
    // resolves first wins, exactly as Bully expects on startup).
    const startupTimer = setTimeout(() => {
      let adopted = false
      provider.awareness.getStates().forEach((state) => {
        if (!adopted && state?.[FIELD_KNOWN_COORDINATOR]?.coordinatorId) {
          adopted = true
          announceCoordinator(state[FIELD_KNOWN_COORDINATOR].coordinatorId)
          logElection('adopted known coordinator from peer state')
        }
      })
      if (!adopted && !coordinatorIdRef.current) {
        startElection()
      }
    }, STARTUP_DEBOUNCE_MS)

    return () => {
      clearTimeout(startupTimer)
      clearElectionTimeout()
      provider.awareness.off('change', onAwarenessChange)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc, provider, ready])

  // Automatic re-election when the current coordinator disconnects, reusing
  // the same "diff the peer list" pattern useToasts.js already uses for
  // join/leave detection.
  useEffect(() => {
    const currentIds = new Set(peers.map((p) => String(p.clientId)))
    if (prevPeerIdsRef.current === null) {
      prevPeerIdsRef.current = currentIds
      return
    }
    const prevIds = prevPeerIdsRef.current
    prevIds.forEach((id) => {
      if (!currentIds.has(id) && id === coordinatorIdRef.current) {
        logElection('coordinator disconnected — triggering re-election')
        coordinatorIdRef.current = null
        setCoordinatorId(null)
        startElectionRef.current()
      }
    })
    prevPeerIdsRef.current = currentIds
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [peers])

  const forceReElection = () => {
    logElection('manual force re-election triggered')
    startElectionRef.current()
  }

  return {
    coordinatorId,
    isCoordinator: coordinatorId === localPeerId,
    electionInProgress,
    electionLog,
    forceReElection
  }
}
