const ADJECTIVES = ['Swift', 'Amber', 'Quiet', 'Brave', 'Lucky', 'Calm', 'Bold', 'Sunny', 'Clever', 'Gentle']
const ANIMALS = ['Fox', 'Otter', 'Hawk', 'Panda', 'Wolf', 'Heron', 'Lynx', 'Falcon', 'Badger', 'Robin']

// Distinct, high-contrast colors used both for the presence panel and the
// remote cursor/selection highlight rendered by y-quill in the editor.
const COLORS = [
  '#ff5d8f', '#4dd0e1', '#7c4dff', '#ffb74d',
  '#69f0ae', '#ff8a65', '#40c4ff', '#e040fb',
  '#ffd740', '#00e5ff', '#b2ff59', '#ff6e6e'
]

// Purely cosmetic "class" + avatar for the gamified UI — no gameplay logic
// attached, just flavor so each peer reads as a distinct character in the
// party panel.
const CLASSES = ['Scribe', 'Wanderer', 'Sentinel', 'Trickster', 'Sage', 'Ranger']
const AVATARS = ['🧙', '🦊', '🐉', '🦉', '🐺', '🦄', '🐙', '🦁', '🐧', '🦅', '🐢', '🦋']

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)]

// Generates a random, human-friendly identity for the local user. This is
// purely local/client-side — no server assigns identities, so there is no
// central authority handing out names, consistent with the "no central
// document server" architecture.
export function randomIdentity() {
  return {
    name: `${pick(ADJECTIVES)} ${pick(ANIMALS)}`,
    color: pick(COLORS),
    avatar: pick(AVATARS),
    className: pick(CLASSES)
  }
}
