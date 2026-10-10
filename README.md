# P2P Collaborative Text Editor

Real-time collaborative rich-text editing over direct WebRTC connections between browsers, using Yjs CRDTs. A minimal Node.js WebSocket server is used **only** for initial peer discovery/signaling — it never sees document content. See `ARCHITECTURE.md` for the full data-flow diagram and the CRDT/no-central-authority explanation for your report.

**Part 1** (below) is the core editor: sync, presence, reconnection. **Part 2** ([jump to section](#part-2--synchronization-layer-unit-3--4)) adds vector-clock logging, Bully coordinator election, and a hash-chain audit log on top, without modifying Part 1's sync path.

## Part 1 — Core Editor

## Stack

- Frontend: React + Vite
- CRDT: Yjs
- P2P transport: y-webrtc (WebRTC data channels, Google STUN)
- Editor: Quill.js bound via y-quill
- Presence: y-webrtc's built-in awareness (`y-protocols/awareness`, bundled in `yjs`)
- Local persistence: y-indexeddb (survives tab refresh only — not distributed storage)
- Signaling: custom Node.js + `ws` server

## Project layout

```
p2p-editor/
├── signaling-server/   # Node.js ws signaling server (peer discovery only)
├── frontend/           # React + Vite app
├── ARCHITECTURE.md      # diagrams + CRDT / no-central-authority explanation
└── README.md
```

## Setup

Requires Node.js >= 18.

```bash
cd p2p-editor
npm run install:all
```

(equivalent to running `npm install` inside both `signaling-server/` and `frontend/`)

Copy the frontend env example (defaults are fine for local testing):

```bash
cp frontend/.env.example frontend/.env
```

## Running locally

Two terminals, from the `p2p-editor/` root:

```bash
# Terminal 1 — signaling server (localhost:4444)
npm run signaling

# Terminal 2 — frontend dev server (localhost:5173)
npm run dev
```

Open `http://localhost:5173` — a room ID is generated automatically and appended to the URL (`?room=...`). Open the same URL in a second tab (or an incognito window) to test sync.

## Testing checklist (all verified against this implementation)

1. **Two-way sync**: Open the room URL in two browser windows (e.g. one normal, one incognito, so they don't share `sessionStorage`/identity). Type in one — text appears in the other within ~1s on the same machine/network.
2. **Three-way sync**: Open a third window with the same room URL. All three should converge, not just pairwise — try typing in different windows in quick succession and confirm every window ends up with identical text.
3. **Presence on close**: Close one window. The remaining windows' peer list should drop that peer within a few seconds (awareness timeout), with no crash or console error.
4. **Refresh recovery**: Refresh one tab. It reconnects (status goes Connecting → Connected) and the editor repopulates from `y-indexeddb`'s local cache immediately, then re-syncs with peers over WebRTC to catch up on anything it missed while reloading.
5. **Signaling server killed after connection**: With two tabs already showing "Connected via P2P", stop the signaling server (Ctrl+C in its terminal). Keep typing in both tabs — **sync keeps working**, confirmed by testing: the connection between the two browsers was already established and does not depend on the signaling server staying up.
   - **Important nuance found during testing**: if the *new* peer you open afterwards is another tab in the **same browser**, it will still connect — y-webrtc also uses the browser's `BroadcastChannel` API as a same-origin fast path, completely independent of the signaling server, so same-browser tabs can always find each other regardless of signaling state. This is expected y-webrtc behavior, not a bug, but it means "open a 3rd tab" is *not* a valid way to test signaling-dependent discovery.
   - To actually observe discovery failing, the new peer must be a genuinely separate browser context that shares no `BroadcastChannel` with the existing tabs — e.g. a **different device** (see the cross-device section below), or a different browser entirely (Chrome vs. Firefox) on the same machine. In that situation, with the signaling server down, the new peer correctly gets stuck on "Connecting…" and then "Connection error", while the original two tabs keep syncing unaffected.
6. **Cross-device on the same Wi-Fi** — see below.

## Testing across two real devices on the same Wi-Fi

`localhost` only works within one machine, so for a genuine second-device test:

1. On the machine running the servers, find its LAN IP:
   - Windows (PowerShell): `ipconfig` → look for "IPv4 Address" under your active Wi-Fi adapter (e.g. `192.168.1.23`).
2. Edit `frontend/.env`:
   ```
   VITE_SIGNALING_URL=ws://192.168.1.23:4444
   ```
   (use your actual IP)
3. Restart the frontend dev server (`npm run dev`) — Vite is already configured with `host: true` (see `frontend/vite.config.js`), so it binds to all network interfaces, not just localhost.
4. On the **first** device, open `http://192.168.1.23:5173` (note: not `localhost`) and copy the room link from the "Copy link" button.
5. On the **second** device (phone, laptop, another PC — same Wi-Fi network), open that copied link in a browser.
6. Both devices must be able to reach `192.168.1.23:4444` and `:5173` — if your OS firewall prompts to allow Node.js/network access the first time you start these servers, allow it (Private/Home network), otherwise the second device's connections will be blocked before they even reach WebRTC.
7. Confirm typing syncs both ways and both devices show each other in the presence panel.

If the two devices can't establish a WebRTC connection despite signaling succeeding (visible as "Connecting…" that never resolves to "Connected"), it's most likely router client isolation (some Wi-Fi APs, especially "guest" networks, block device-to-device traffic) — this is a network configuration issue, not a bug in the app, and is the boundary case where a TURN server (intentionally out of scope for Part 1) would normally be added.

## Deploying the signaling server

A `Dockerfile` is provided in `signaling-server/`. Any container host works; Render's free tier is the simplest:

1. Push this repo to GitHub.
2. On Render: **New → Web Service**, point at the repo, set root directory to `signaling-server`, and either let it detect the `Dockerfile` or set:
   - Build command: `npm install`
   - Start command: `npm start`
3. Render assigns a public URL like `wss://your-service.onrender.com` (Render terminates TLS, so use `wss://` not `ws://`). Set `VITE_SIGNALING_URL` in `frontend/.env` to that URL and rebuild the frontend.

No environment variables are required beyond the optional `PORT` (Render sets this automatically; the server already reads `process.env.PORT`).

## What was NOT fully implemented, and why

- **TURN server**: intentionally excluded per the project spec (STUN-only, same-network demo assumption). Flagged again here since it's the most likely cause of a failed cross-network demo.
- **Deterministic "WebRTC failed" error detection**: y-webrtc doesn't expose one clean event for "handshake failed" at the provider API level; the app uses an 8-second timeout heuristic (see `frontend/src/hooks/useYjsRoom.js`) instead of a guaranteed instant failure signal. Documented in `ARCHITECTURE.md` under Known Limitations.
- **QR code generation**: not in the required dependency list; a copyable share link is provided instead so as not to introduce an unrequested dependency. Easy to add later with a small `qrcode` package if wanted.
- Everything else in the requirements (room sessions, real-time sync, presence + remote cursors, connection status, signaling boundary, local persistence) is implemented and covered by the testing checklist above.

## Part 2 — Synchronization Layer (Unit 3 & 4)

Three additions on top of Part 1, all living in new files (`frontend/src/sync/`, plus new hooks/components) and all transported over Yjs's **Awareness** side-channel — a protocol already distinct from the Y.Doc sync protocol Part 1 uses (see "Design notes" below for why this counts as a real side-channel and not a reuse of Yjs's document-sync wire format).

### Feature 1 — Vector clock logging & visualization

- Logic: `frontend/src/sync/vectorClock.js` (pure functions), wired up in `frontend/src/hooks/useVectorClockLog.js`.
- UI: click **🛰 Debug panel** (bottom-right) → **Vector Clocks** tab.
- **To demo "concurrent" detection**: open the same room in two tabs, click into the editor in both, and type in the *same region of the document* within about a second of each other in each tab. Both operations will show up in the panel highlighted in pink with an "⚡ concurrent" badge — because at the moment each peer made its edit, neither had yet seen the other's, which is exactly what a vector clock comparison is supposed to catch (this is real vector-clock math running on real edit timestamps, not a canned demo state).
- If you instead type in one tab, wait ~2s, then type in the other, you'll see "➡ after" / "⬅ before" instead — the causal ordering flips once one edit has actually been observed before the next happens.

### Feature 2 — Bully election for session coordinator

- Logic: `frontend/src/hooks/useCoordinatorElection.js`.
- UI: the **👑 Coordinator: …** badge under the header, always visible, plus the **Election Log** tab in the debug panel for narrating each phase (`ELECTION sent`, `ELECTION received from …`, `response received from …`, `COORDINATOR announced`).
- **To demo automatic election**: open 2–3 tabs on the same room; within ~1.5s of the mesh settling, all tabs converge on the same coordinator with no manual action.
- **To demo automatic re-election on disconnect**: close the tab currently shown as coordinator. The remaining tabs' badges flip to "Electing coordinator…" and then to the new coordinator within a few seconds — watch the Election Log tab to narrate why (a lower-priority peer's own election naturally settles once no higher peer responds).
- **To demo a manual re-election** (coordinator still alive): click **⟳ Force re-election** on any tab. The Election Log will show an ELECTION/ALIVE exchange and the badge should end up unchanged, since Bully correctly confirms the existing higher-priority coordinator instead of replacing it.
- Priority = each peer's Yjs `clientID` (a random uint32 already assigned per browser tab) rather than a join-order timestamp — see "Design notes" for why.

### Feature 3 — Hash-chain audit log

- Logic: `frontend/src/sync/hashChain.js`, wired up in `frontend/src/hooks/useAuditLog.js`.
- UI: click **📜 Audit log (N)** (bottom-left). Every entry shows its truncated hash, its predecessor's hash, and a ✓/✗ verification status recomputed live from the entry's own fields.
- The **current coordinator** is the only peer that appends entries (peer joined / peer left / coordinator elected / periodic checkpoint every 5 edits or 45s, whichever comes first); every peer replicates the chain locally as entries are broadcast.
- **To demo the tamper test**: click **🧪 Tamper with this entry** on any non-genesis entry. That entry and every entry after it flip to red "✗ INVALID" immediately — because each entry's hash covers its own fields, and each entry after it commits to the previous entry's (now-wrong) hash, corruption cascades forward exactly as a hash chain should. Entries *before* the tampered one stay green. This mutation is local-only and is never broadcast to other peers (clearly a demo-only button, not a real "corrupt the shared log" action).

### Design notes / honest trade-offs (for the report)

- **Why Bully over Ring**: Ring election needs a well-defined successor ordering and tolerates a token being passed peer-to-peer around a cycle, which fits topologies where peers *can't* all reach each other directly. This app's WebRTC layer is already a full mesh (every peer holds a direct data channel to every other peer, via Part 1's `y-webrtc` setup) — Bully assumes exactly this ("any peer can message any peer directly"), so it needs no extra routing logic on top of what Part 1 already built, whereas Ring would require constructing and maintaining a separate logical ring topology that the underlying network doesn't naturally have.
- **The coordinator's single point of responsibility vs. Part 1's "no central authority" claim**: this is a real tension, not something to paper over. Part 1's claim is specifically about the *document*: there's no server that owns document state, and any peer can leave without the document breaking, because Yjs's CRDT merge doesn't need a coordinator. Part 2 introduces a coordinator, but scopes its authority narrowly — it only decides "who appends the next audit-log entry," never document content. If the coordinator disconnects, editing continues uninterrupted (Part 1 is untouched), and Bully re-elects a replacement within a few seconds; the only thing that pauses is audit-log growth during that gap. So the system as a whole is still leaderless for the thing that matters most (the shared document), but Part 2 deliberately trades a small amount of that decentralization for a single, unambiguous writer for the audit log — appending audit entries from multiple peers concurrently would need its own conflict resolution (e.g. per-peer sub-chains merged later), which was judged not worth the complexity for what the log is used for here.
- **Why a hash chain, not a blockchain**: a blockchain's consensus/mining machinery (proof-of-work, longest-chain rules, etc.) exists to let *mutually untrusted* nodes agree on one canonical ordering when multiple parties might submit conflicting blocks at once. Here there's exactly one writer at any given time (the elected coordinator) and no competing writers to arbitrate between — so the only property actually needed is tamper-evidence (any retroactive edit to an entry is detectable), which a plain SHA-256 hash chain provides at a fraction of the complexity, with no mining delay and no fork-resolution logic required.

### What was NOT fully implemented or verified (Part 2)

- **Audit-chain resync after a missed broadcast**: if a peer misses one of the coordinator's `auditEntry` awareness broadcasts (e.g. it joins mid-broadcast, or an update is dropped), it has no backfill/resync request — it just logs a console warning and stops appending further entries until restarted. Flagged in `useAuditLog.js`'s header comment. Not expected to trigger during the demo scenarios above, but it is a real gap, not a hidden one.
- **Bully's targeted send/receive is implemented as broadcast + priority filtering**, not literal point-to-point messages — justified above under "Why Bully over Ring" (the underlying topology is already a full mesh, so this is behaviorally equivalent), but it is a simplification worth being able to explain if asked.
- **Live multi-tab verification: done.** `npm run build` passes, and all 7 testing requirements were run end-to-end with 3–4 real browser tabs (Playwright automation against the actual running app, not a mock): basic/3-way Part 1 sync, automatic coordinator election on startup, genuinely concurrent vector-clock flagging (via true-parallel typing in two tabs), automatic re-election after closing the coordinator's tab (settles in well under a second once the closing tab's `beforeunload` cleanup fires), a no-op-but-correct forced re-election while the coordinator stays alive, a `peer_joined` audit entry on a 4th peer joining mid-session, and the tamper-test cascade (tampered entry + everything after it turns invalid, everything before stays valid). One real bug was caught and fixed in this process: an already-elected coordinator could be bounced back into re-electing itself by a stray late `ELECTION` message from a lower-priority peer.
- One pre-existing, unrelated environment note: `frontend/.env`'s `VITE_SIGNALING_URL` may be pointed at a specific LAN IP from prior cross-device testing rather than `localhost` — if you see a `WebSocket ... ERR_CONNECTION_TIMED_OUT` in the console during same-machine testing, that's why (harmless; same-browser tabs still sync via the `BroadcastChannel` fallback described in Part 1's README). Point it back at `ws://localhost:4444` for local testing, or your current machine's real LAN IP for a cross-device demo.
