import { useState } from 'react'

const RELATION_LABEL = {
  before: '⬅ before',
  after: '➡ after',
  concurrent: '⚡ concurrent',
  equal: '= equal'
}

function formatClock(clock) {
  const entries = Object.entries(clock)
  if (entries.length === 0) return '{}'
  return `{ ${entries.map(([peer, count]) => `${peer.slice(-4)}:${count}`).join(', ')} }`
}

function formatTime(ts) {
  return new Date(ts).toLocaleTimeString([], { hour12: false, minute: '2-digit', second: '2-digit' })
}

/**
 * Toggleable debug/demo sidebar for Part 2 / Unit 3: a live log of edit
 * operations with their vector clock snapshots and causal relation to the
 * previous entry (Feature 1), plus the Bully election phase log
 * (Feature 2). Purely a viewer over data already computed by
 * useVectorClockLog / useCoordinatorElection — no logic lives here.
 */
export default function DebugPanel({ vectorClockLog, electionLog }) {
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState('vector')

  return (
    <>
      <button className="debug-toggle" onClick={() => setOpen((v) => !v)}>
        {open ? '✕ Close debug panel' : '🛰 Debug panel'}
      </button>
      {open && (
        <aside className="debug-panel">
          <div className="debug-tabs">
            <button className={tab === 'vector' ? 'active' : ''} onClick={() => setTab('vector')}>
              Vector Clocks
            </button>
            <button className={tab === 'election' ? 'active' : ''} onClick={() => setTab('election')}>
              Election Log
            </button>
          </div>

          {tab === 'vector' && (
            <ul className="debug-log">
              {vectorClockLog.length === 0 && <li className="debug-empty">No edits yet — start typing.</li>}
              {vectorClockLog.map((entry) => (
                <li key={entry.id} className={`debug-entry relation-${entry.relation}`}>
                  <div className="debug-entry-head">
                    <span className="debug-peer">{entry.peerName}</span>
                    <span className="debug-time">{formatTime(entry.timestamp)}</span>
                  </div>
                  <div className="debug-clock">{formatClock(entry.clock)}</div>
                  <div className={`debug-relation relation-badge-${entry.relation}`}>
                    {RELATION_LABEL[entry.relation]}
                  </div>
                </li>
              ))}
            </ul>
          )}

          {tab === 'election' && (
            <ul className="debug-log">
              {electionLog.length === 0 && <li className="debug-empty">No election activity yet.</li>}
              {electionLog.map((entry) => (
                <li key={entry.id} className="debug-entry">
                  <div className="debug-entry-head">
                    <span className="debug-time">{formatTime(entry.timestamp)}</span>
                  </div>
                  <div className="debug-message">{entry.message}</div>
                </li>
              ))}
            </ul>
          )}
        </aside>
      )}
    </>
  )
}
