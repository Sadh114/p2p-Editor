import { useMemo, useState } from 'react'
import { useYjsRoom } from './hooks/useYjsRoom.js'
import { useToasts } from './hooks/useToasts.js'
import { useVectorClockLog } from './hooks/useVectorClockLog.js'
import { useCoordinatorElection } from './hooks/useCoordinatorElection.js'
import { useAuditLog } from './hooks/useAuditLog.js'
import Editor from './components/Editor.jsx'
import PresencePanel from './components/PresencePanel.jsx'
import ConnectionStatus from './components/ConnectionStatus.jsx'
import RoomBar from './components/RoomBar.jsx'
import QuestProgress from './components/QuestProgress.jsx'
import Toasts from './components/Toasts.jsx'
import DebugPanel from './components/DebugPanel.jsx'
import CoordinatorBadge from './components/CoordinatorBadge.jsx'
import AuditLogPanel from './components/AuditLogPanel.jsx'
import { randomIdentity } from './utils/randomIdentity.js'

function generateRoomId() {
  return Math.random().toString(36).slice(2, 8) + Math.random().toString(36).slice(2, 8)
}

function getOrCreateRoomId() {
  const params = new URLSearchParams(window.location.search)
  let room = params.get('room')
  if (!room) {
    room = generateRoomId()
    params.set('room', room)
    window.history.replaceState({}, '', `${window.location.pathname}?${params.toString()}`)
  }
  return room
}

function getOrCreateIdentity() {
  // sessionStorage is per-tab, so each browser tab you open gets a stable
  // identity across refreshes but a distinct one from other tabs — handy
  // for the "does refresh recover state" test without renaming yourself
  // every time.
  const cached = sessionStorage.getItem('p2p-editor-identity')
  if (cached) return JSON.parse(cached)
  const identity = randomIdentity()
  sessionStorage.setItem('p2p-editor-identity', JSON.stringify(identity))
  return identity
}

/**
 * RoomApp is keyed by roomId at the mount point below so that the entire
 * Yjs/WebRTC stack (created inside useYjsRoom) is torn down and recreated
 * from scratch if the user ever navigates to a different room, instead of
 * trying to mutate a live Y.Doc/WebrtcProvider into pointing at a new room.
 */
function RoomApp({ roomId, identity }) {
  const { doc, provider, status, peers, ready } = useYjsRoom(roomId, identity)
  const toasts = useToasts(peers, status)

  // --- Part 2: Synchronization layer (Unit 3 & 4) ---
  // All three hooks below run strictly over Yjs's Awareness side-channel
  // (see each hook's header comment) and never touch the Y.Doc sync
  // protocol that Editor.jsx/useYjsRoom.js rely on for Part 1.
  const { log: vectorClockLog } = useVectorClockLog(doc, provider, ready, identity)
  const { coordinatorId, isCoordinator, electionInProgress, electionLog, forceReElection } =
    useCoordinatorElection(doc, provider, ready, identity, peers)
  const { chain: auditChain, verification: auditVerification, tamperEntry } = useAuditLog(
    doc,
    provider,
    ready,
    identity,
    peers,
    coordinatorId,
    isCoordinator
  )
  const coordinatorName =
    coordinatorId != null
      ? peers.find((p) => String(p.clientId) === String(coordinatorId))?.name ||
        (isCoordinator ? identity.name : `Peer ${coordinatorId}`)
      : null

  return (
    <div className="app">
      <Toasts toasts={toasts} />

      <header className="app-header">
        <div className="app-title">
          <h1>⚔️ SyncQuest</h1>
          <span className="app-subtitle">a peer-to-peer realm editor</span>
        </div>
        <ConnectionStatus status={status} />
      </header>

      <RoomBar roomId={roomId} />

      {ready && <QuestProgress doc={doc} />}

      {ready && (
        <CoordinatorBadge
          coordinatorId={coordinatorId}
          coordinatorName={coordinatorName}
          isCoordinator={isCoordinator}
          electionInProgress={electionInProgress}
          onForceReElection={forceReElection}
        />
      )}

      <main className="app-main">
        {ready ? (
          <Editor doc={doc} awareness={provider.awareness} />
        ) : (
          <div className="editor-loading">📜 Unrolling your scroll…</div>
        )}
        <PresencePanel peers={peers} />
      </main>

      {ready && (
        <footer className="app-footer">
          <DebugPanel vectorClockLog={vectorClockLog} electionLog={electionLog} />
          <AuditLogPanel chain={auditChain} verification={auditVerification} onTamper={tamperEntry} />
        </footer>
      )}
    </div>
  )
}

export default function App() {
  const [roomId] = useState(getOrCreateRoomId)
  const identity = useMemo(getOrCreateIdentity, [])

  return <RoomApp key={roomId} roomId={roomId} identity={identity} />
}
