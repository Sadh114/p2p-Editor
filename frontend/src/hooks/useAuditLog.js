import { useEffect, useRef, useState } from 'react'
import { createEntry, genesisEntry, verifyChain } from '../sync/hashChain.js'

// Side-channel awareness field carrying newly-appended chain entries.
// Deliberately not the Y.Doc sync protocol: the audit chain is Part 2
// system-coordination metadata, not shared document content.
const FIELD_AUDIT_ENTRY = 'auditEntry'

const CHECKPOINT_EVERY_EDITS = 5
const CHECKPOINT_INTERVAL_MS = 45000

/**
 * Append-only, hash-chained audit log of "significant system events"
 * (peer joined/left, coordinator elected, periodic checkpoints). Only the
 * current coordinator appends; every peer replicates by listening for the
 * coordinator's broadcast and keeps its own local copy of the chain — the
 * chain itself lives in each peer's React state, not on any server.
 *
 * Known limitation (flagged honestly rather than hidden): if a peer misses
 * a broadcast entry (e.g. joins mid-broadcast or has a dropped awareness
 * update) its local chain can fall behind the coordinator's. There's no
 * chain-resync/backfill request implemented — out of scope for this demo;
 * see README for what re-running the full test suite does and doesn't
 * cover here.
 */
export function useAuditLog(doc, provider, ready, identity, peers, coordinatorId, isCoordinator) {
  const [chain, setChain] = useState(() => [genesisEntry()])
  const [verification, setVerification] = useState({ valid: true, results: [] })

  const chainRef = useRef(chain)
  const seqRef = useRef(0)
  const processedRef = useRef(new Map()) // peerId -> last seq applied
  const isCoordinatorRef = useRef(isCoordinator)
  const prevIsCoordinatorRef = useRef(false)
  const prevPeerIdsRef = useRef(null)
  const editsSinceCheckpointRef = useRef(0)

  useEffect(() => {
    isCoordinatorRef.current = isCoordinator
  }, [isCoordinator])

  const appendLocalEntry = async (eventType, data) => {
    const tail = chainRef.current[chainRef.current.length - 1]
    const entry = await createEntry({ index: chainRef.current.length, eventType, data, prevHash: tail.hash })
    chainRef.current = [...chainRef.current, entry]
    setChain(chainRef.current)
    seqRef.current += 1
    provider.awareness.setLocalStateField(FIELD_AUDIT_ENTRY, { entry, seq: seqRef.current })
    return entry
  }

  // Receive coordinator-broadcast entries.
  useEffect(() => {
    if (!ready) return
    const onAwarenessChange = ({ added, updated }) => {
      const states = provider.awareness.getStates()
      ;[...added, ...updated].forEach((clientId) => {
        if (clientId === doc.clientID) return
        const peerId = String(clientId)
        if (peerId !== coordinatorId) return // only the current coordinator's entries are trusted
        const payload = states.get(clientId)?.[FIELD_AUDIT_ENTRY]
        if (!payload) return
        const lastSeq = processedRef.current.get(peerId) || 0
        if (payload.seq <= lastSeq) return
        processedRef.current.set(peerId, payload.seq)
        const tail = chainRef.current[chainRef.current.length - 1]
        const { entry } = payload
        if (entry.index === chainRef.current.length && entry.prevHash === tail.hash) {
          chainRef.current = [...chainRef.current, entry]
          setChain(chainRef.current)
        } else {
          console.warn('[audit log] received out-of-sequence entry, skipping (no resync implemented)', entry)
        }
      })
    }
    provider.awareness.on('change', onAwarenessChange)
    return () => provider.awareness.off('change', onAwarenessChange)
  }, [doc, provider, ready, coordinatorId])

  // Coordinator: log "coordinator elected" the moment we become coordinator.
  useEffect(() => {
    if (!ready || !isCoordinator) {
      prevIsCoordinatorRef.current = isCoordinator
      return
    }
    if (!prevIsCoordinatorRef.current) {
      appendLocalEntry('coordinator_elected', { coordinatorId, name: identity.name })
    }
    prevIsCoordinatorRef.current = isCoordinator
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, isCoordinator, coordinatorId])

  // Coordinator: log peer joined/left (diffing the presence list, same
  // approach as useToasts.js).
  useEffect(() => {
    if (!ready) return
    const currentIds = new Set(peers.map((p) => String(p.clientId)))
    if (prevPeerIdsRef.current === null) {
      prevPeerIdsRef.current = currentIds
      return
    }
    if (isCoordinatorRef.current) {
      const prevIds = prevPeerIdsRef.current
      peers.forEach((peer) => {
        const peerId = String(peer.clientId)
        if (!peer.self && !prevIds.has(peerId)) {
          appendLocalEntry('peer_joined', { peerId, name: peer.name })
        }
      })
      prevIds.forEach((id) => {
        if (!currentIds.has(id)) {
          appendLocalEntry('peer_left', { peerId: id })
        }
      })
    }
    prevPeerIdsRef.current = currentIds
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, peers])

  // Coordinator: periodic checkpoints, every N edits or X seconds, whichever comes first.
  useEffect(() => {
    if (!ready) return
    const ytext = doc.getText('quill-content')

    const onDocUpdate = () => {
      if (!isCoordinatorRef.current) return
      editsSinceCheckpointRef.current += 1
      if (editsSinceCheckpointRef.current >= CHECKPOINT_EVERY_EDITS) {
        editsSinceCheckpointRef.current = 0
        appendLocalEntry('checkpoint', { textLength: ytext.length, reason: 'edit-count' })
      }
    }
    doc.on('update', onDocUpdate)

    const interval = setInterval(() => {
      if (isCoordinatorRef.current && editsSinceCheckpointRef.current > 0) {
        editsSinceCheckpointRef.current = 0
        appendLocalEntry('checkpoint', { textLength: ytext.length, reason: 'interval' })
      }
    }, CHECKPOINT_INTERVAL_MS)

    return () => {
      doc.off('update', onDocUpdate)
      clearInterval(interval)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc, ready])

  // Re-verify the chain whenever it changes (including after a manual tamper).
  useEffect(() => {
    let cancelled = false
    verifyChain(chain).then((result) => {
      if (!cancelled) setVerification(result)
    })
    return () => {
      cancelled = true
    }
  }, [chain])

  /** Demo-only: corrupts one entry's data client-side (never broadcast) so verification visibly fails from that point on. */
  const tamperEntry = (index) => {
    chainRef.current = chainRef.current.map((entry, i) =>
      i === index ? { ...entry, data: { ...entry.data, tampered: true, tamperedAt: Date.now() } } : entry
    )
    setChain(chainRef.current)
  }

  return { chain, verification, tamperEntry }
}
