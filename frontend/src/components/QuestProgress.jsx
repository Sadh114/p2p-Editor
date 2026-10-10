import { useEffect, useState } from 'react'

const XP_PER_LEVEL = 200

/**
 * Purely cosmetic "party progress" bar. It derives from the live length of
 * the shared Y.Text (`doc.getText('quill-content')`) — the SAME CRDT state
 * every peer already has a consistent view of — so this number is
 * automatically identical on every peer with zero extra network traffic or
 * protocol changes. No gameplay/scoring logic is stored in the document;
 * this is a read-only view computed locally from existing state.
 */
export default function QuestProgress({ doc }) {
  const [length, setLength] = useState(0)

  useEffect(() => {
    const ytext = doc.getText('quill-content')
    const update = () => setLength(ytext.length)
    update()
    ytext.observe(update)
    return () => ytext.unobserve(update)
  }, [doc])

  const level = Math.floor(length / XP_PER_LEVEL) + 1
  const xpIntoLevel = length % XP_PER_LEVEL
  const xpPercent = Math.min(100, Math.round((xpIntoLevel / XP_PER_LEVEL) * 100))

  return (
    <div className="quest-progress" title={`${length} characters written together`}>
      <span className="quest-level">Realm Lv.{level}</span>
      <div className="xp-bar">
        <div className="xp-bar-fill" style={{ width: `${xpPercent}%` }} />
      </div>
      <span className="quest-xp">{xpIntoLevel}/{XP_PER_LEVEL} XP</span>
    </div>
  )
}
