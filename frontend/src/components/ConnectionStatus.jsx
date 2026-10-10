const LABELS = {
  connecting: { text: 'Opening the portal…', icon: '🌀', className: 'status-connecting' },
  connected: { text: 'Portal Open — Synced!', icon: '✨', className: 'status-connected' },
  disconnected: { text: 'Portal Closed', icon: '💤', className: 'status-disconnected' },
  error: {
    text: 'Portal Sealed — could not reach the signaling realm or a fellow traveler',
    icon: '⚠️',
    className: 'status-error'
  }
}

export default function ConnectionStatus({ status }) {
  const { text, icon, className } = LABELS[status] || LABELS.connecting
  return (
    <div className={`connection-status ${className}`} role="status">
      <span className="status-icon">{icon}</span>
      {text}
    </div>
  )
}
