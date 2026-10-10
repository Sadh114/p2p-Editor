import { useState } from 'react'

export default function RoomBar({ roomId }) {
  const [copied, setCopied] = useState(false)
  const shareUrl = `${window.location.origin}${window.location.pathname}?room=${roomId}`

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch (e) {
      // Clipboard API can be unavailable (e.g. non-HTTPS LAN IP in some
      // browsers) — fall back to a manual-select prompt rather than
      // failing silently.
      window.prompt('Copy this portal link:', shareUrl)
    }
  }

  return (
    <div className="room-bar">
      <span className="room-id">
        🗺️ Realm: <code>{roomId}</code>
      </span>
      <input className="room-link" readOnly value={shareUrl} onFocus={(e) => e.target.select()} />
      <button onClick={copyLink}>{copied ? '✅ Copied!' : '🔗 Copy Portal Link'}</button>
    </div>
  )
}
