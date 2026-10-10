import { useEffect, useRef, useState } from 'react'

const TOAST_LIFETIME_MS = 3500

let nextToastId = 1

/**
 * Cosmetic notification feed: "ally joined/left the realm" toasts derived
 * from diffing the awareness-based peer list, plus a one-time "party
 * assembled" achievement toast the first time we transition into
 * `status === 'connected'`. Purely presentational — does not read or
 * write anything into the shared Y.Doc.
 */
export function useToasts(peers, status) {
  const [toasts, setToasts] = useState([])
  const prevPeerIdsRef = useRef(null)
  const achievementShownRef = useRef(false)

  const pushToast = (message, kind = 'info') => {
    const id = nextToastId++
    setToasts((current) => [...current, { id, message, kind }])
    setTimeout(() => {
      setToasts((current) => current.filter((t) => t.id !== id))
    }, TOAST_LIFETIME_MS)
  }

  useEffect(() => {
    const currentIds = new Set(peers.filter((p) => !p.self).map((p) => p.clientId))
    if (prevPeerIdsRef.current === null) {
      prevPeerIdsRef.current = currentIds
      return
    }
    const prevIds = prevPeerIdsRef.current
    peers.forEach((peer) => {
      if (!peer.self && !prevIds.has(peer.clientId)) {
        pushToast(`${peer.avatar || '🧝'} ${peer.name} joined the realm!`, 'join')
      }
    })
    prevIds.forEach((id) => {
      if (!currentIds.has(id)) {
        const known = peers.find((p) => p.clientId === id)
        pushToast(`${known?.avatar || '👋'} ${known?.name || 'An ally'} left the realm.`, 'leave')
      }
    })
    prevPeerIdsRef.current = currentIds
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [peers])

  useEffect(() => {
    if (status === 'connected' && !achievementShownRef.current) {
      achievementShownRef.current = true
      pushToast('🏆 Achievement unlocked: Party Assembled!', 'achievement')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status])

  return toasts
}
