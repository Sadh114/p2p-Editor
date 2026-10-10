/**
 * ============================================================================
 *  P2P COLLABORATIVE EDITOR — SIGNALING SERVER
 * ============================================================================
 *
 *  WHAT THIS SERVER DOES:
 *    Implements the y-webrtc "signaling" wire protocol over plain WebSocket
 *    (see https://github.com/yjs/y-webrtc). Its ONLY job is to let browser
 *    peers that want to join the same `room` find each other and exchange
 *    the small handshake messages WebRTC needs to open a direct connection:
 *      - SDP offers / answers
 *      - ICE candidates
 *
 *  WHAT THIS SERVER NEVER DOES (READ THIS — this is the "no central
 *  document server" boundary the project report needs to point at):
 *    - It never receives, stores, parses, or relays Yjs CRDT updates.
 *    - It never sees the text typed into the editor.
 *    - It has NO knowledge of the Yjs document schema, Quill deltas, or
 *      anything related to document *content*.
 *
 *  WHY THAT'S STRUCTURALLY TRUE (not just a promise in a comment):
 *    y-webrtc's client-side WebrtcProvider opens TWO completely separate
 *    communication channels:
 *      1. A WebSocket to *this* server, used only to exchange the
 *         `publish` envelopes below (type: 'subscribe' / 'publish' / etc.)
 *         so peers can find each other's SDP/ICE info. This is the ONLY
 *         channel this file has code for.
 *      2. Once the handshake completes, an RTCDataChannel opens *directly*
 *         between the two browsers. All Yjs sync traffic (the actual
 *         document updates + awareness/cursor state) flows over that
 *         data channel, browser-to-browser, and NEVER touches this
 *         process. This file has no code path that could even see that
 *         traffic — the data channel bytes are not routed through this
 *         server at the network level, let alone the application level.
 *
 *    So: even a compromised or malicious version of this server could at
 *    worst disrupt *peer discovery* (stop new peers from finding each
 *    other) — it structurally cannot read or tamper with document content,
 *    because that content is never sent to it.
 *
 *  PROTOCOL (matches the y-webrtc client, so do not change message shapes
 *  unless you also change the client's `signaling` option handling):
 *    { type: 'subscribe',   topics: [roomName, ...] }
 *    { type: 'unsubscribe', topics: [roomName, ...] }
 *    { type: 'publish',     topic: roomName, ...arbitraryHandshakeFields }
 *    { type: 'ping' }  -> server replies { type: 'pong' }
 *
 *  Run locally:   npm start        (defaults to port 4444)
 *  Run on LAN:    same command — bind is 0.0.0.0 by default via `ws`.
 * ============================================================================
 */

import { WebSocketServer } from 'ws'
import http from 'http'

const PORT = process.env.PORT || 4444
const PING_TIMEOUT_MS = 30000

// topics: Map<roomName, Set<WebSocket>>
// This is the ENTIRE state this server holds — just "who is listening on
// which room name for handshake messages". No document data lives here.
const topics = new Map()

const send = (conn, message) => {
  if (conn.readyState !== conn.CONNECTING && conn.readyState !== conn.OPEN) {
    conn.close()
    return
  }
  try {
    conn.send(JSON.stringify(message))
  } catch (e) {
    conn.close()
  }
}

const httpServer = http.createServer((req, res) => {
  // Plain health-check endpoint so free-tier hosts (Render/Railway) can
  // ping this and know the process is alive. Deliberately reveals nothing
  // about active rooms or peers.
  res.writeHead(200, { 'Content-Type': 'text/plain' })
  res.end('p2p-editor signaling server: ok\n')
})

const wss = new WebSocketServer({ noServer: true })

wss.on('connection', (conn) => {
  const subscribedTopics = new Set()
  let closed = false
  let pongReceived = true

  const pingInterval = setInterval(() => {
    if (!pongReceived) {
      conn.close()
      clearInterval(pingInterval)
      return
    }
    pongReceived = false
    try {
      conn.ping()
    } catch (e) {
      conn.close()
    }
  }, PING_TIMEOUT_MS)

  conn.on('pong', () => {
    pongReceived = true
  })

  conn.on('close', () => {
    subscribedTopics.forEach((topicName) => {
      const subs = topics.get(topicName)
      if (subs) {
        subs.delete(conn)
        if (subs.size === 0) topics.delete(topicName)
      }
    })
    subscribedTopics.clear()
    closed = true
    clearInterval(pingInterval)
  })

  conn.on('message', (raw) => {
    if (closed) return
    let message
    try {
      message = JSON.parse(raw)
    } catch (e) {
      return // ignore malformed frames — never trust client input
    }
    if (!message || !message.type) return

    switch (message.type) {
      // --- peer discovery only, below this line -------------------------
      case 'subscribe':
        (message.topics || []).forEach((topicName) => {
          if (typeof topicName !== 'string') return
          const subs = topics.get(topicName) || new Set()
          subs.add(conn)
          topics.set(topicName, subs)
          subscribedTopics.add(topicName)
        })
        break

      case 'unsubscribe':
        (message.topics || []).forEach((topicName) => {
          const subs = topics.get(topicName)
          if (subs) subs.delete(conn)
        })
        break

      case 'publish': {
        // This forwards WebRTC handshake envelopes (SDP/ICE) between
        // browsers subscribed to the same room. The server treats the
        // payload as an opaque blob — it does not (and structurally
        // cannot, since it never carries Yjs updates) inspect document
        // content here.
        if (!message.topic) break
        const receivers = topics.get(message.topic)
        if (receivers) {
          message.clients = receivers.size
          receivers.forEach((receiver) => send(receiver, message))
        }
        break
      }

      case 'ping':
        send(conn, { type: 'pong' })
        break

      default:
        break
    }
  })
})

httpServer.on('upgrade', (request, socket, head) => {
  wss.handleUpgrade(request, socket, head, (ws) => {
    wss.emit('connection', ws, request)
  })
})

httpServer.listen(PORT, () => {
  console.log(`[signaling] listening on :${PORT} (WebRTC handshake relay only — no document content ever passes through this process)`)
})
