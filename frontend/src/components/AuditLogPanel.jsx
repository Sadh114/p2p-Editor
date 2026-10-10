import { useState } from 'react'
import { truncateHash } from '../sync/hashChain.js'

/**
 * Renders the replicated hash-chain audit log (Feature 3 / Unit 4) and the
 * demo-only "tamper test" button. Verification state comes straight from
 * useAuditLog's verifyChain() recomputation — this component just colors
 * entries red once they (or anything before them, transitively) fail.
 */
export default function AuditLogPanel({ chain, verification, onTamper }) {
  const [open, setOpen] = useState(false)
  const resultByIndex = new Map(verification.results.map((r) => [r.index, r]))

  return (
    <>
      <button className="audit-toggle" onClick={() => setOpen((v) => !v)}>
        {open ? '✕ Close audit log' : `📜 Audit log (${chain.length})`}
        {!verification.valid && <span className="audit-toggle-alert"> ⚠ tampered</span>}
      </button>
      {open && (
        <aside className="audit-panel">
          <div className="audit-panel-head">
            <h3>Hash-Chain Audit Log</h3>
            <p className="audit-hint">
              Demo feature: corrupts one entry locally (never sent to peers) so you can show verification
              cascading to failure.
            </p>
          </div>
          <ul className="audit-log">
            {chain.map((entry, i) => {
              const result = resultByIndex.get(entry.index)
              const valid = result ? result.valid : true
              return (
                <li key={entry.index} className={`audit-entry ${valid ? 'audit-valid' : 'audit-invalid'}`}>
                  <div className="audit-entry-head">
                    <span className="audit-index">#{entry.index}</span>
                    <span className="audit-type">{entry.eventType}</span>
                    <span className="audit-status">{valid ? '✓ verified' : '✗ INVALID'}</span>
                  </div>
                  <div className="audit-hash">hash: {truncateHash(entry.hash)}</div>
                  <div className="audit-hash">prev: {truncateHash(entry.prevHash)}</div>
                  {entry.data && Object.keys(entry.data).length > 0 && (
                    <div className="audit-data">{JSON.stringify(entry.data)}</div>
                  )}
                  {i > 0 && (
                    <button className="audit-tamper-btn" onClick={() => onTamper(entry.index)}>
                      🧪 Tamper with this entry
                    </button>
                  )}
                </li>
              )
            })}
          </ul>
        </aside>
      )}
    </>
  )
}
