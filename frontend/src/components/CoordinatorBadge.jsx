/**
 * Persistent "Coordinator: X" indicator (Feature 2 / Unit 3), visible to
 * every peer, plus a manual "force re-election" button for demo purposes.
 * The coordinator's identity comes from useCoordinatorElection, which is
 * the Bully algorithm's actual winner — this component only renders it.
 */
export default function CoordinatorBadge({ coordinatorId, coordinatorName, isCoordinator, electionInProgress, onForceReElection }) {
  return (
    <div className="coordinator-badge">
      <span className="coordinator-icon">👑</span>
      {electionInProgress ? (
        <span className="coordinator-label coordinator-electing">Electing coordinator…</span>
      ) : coordinatorId ? (
        <span className="coordinator-label">
          Coordinator: <strong>{coordinatorName}</strong>
          {isCoordinator && <span className="coordinator-you-tag">YOU</span>}
        </span>
      ) : (
        <span className="coordinator-label coordinator-electing">No coordinator yet…</span>
      )}
      <button className="coordinator-reelect" onClick={onForceReElection} title="Force a new Bully election">
        ⟳ Force re-election
      </button>
    </div>
  )
}
