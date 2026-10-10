import { useEffect, useRef } from 'react'
import Quill from 'quill'
import 'quill/dist/quill.snow.css'
import { QuillBinding } from 'y-quill'

/**
 * Rich text editor bound to the shared Yjs document via y-quill.
 *
 * We instantiate Quill manually (instead of using `react-quill`, which is
 * unmaintained and breaks under React 18 StrictMode's double-invoke
 * behavior) inside a plain useEffect, mirroring the vanilla-JS y-quill
 * examples.
 *
 * --- HOW CONCURRENT EDIT CONFLICTS ARE RESOLVED (for the report) ---
 * `ydoc.getText('quill-content')` returns a Y.Text: a CRDT sequence type.
 * Every keystroke becomes a small operation (insert/delete at a position,
 * tagged with the originating client's ID and a per-client counter). When
 * two peers type at "the same place" concurrently, Yjs does NOT pick a
 * winner or run a merge function at edit time — instead, each operation
 * carries enough causal metadata (a Lamport-style clock per client) that
 * every peer, applying the same set of operations in any order, arrives at
 * an IDENTICAL final document. This property is called Strong Eventual
 * Consistency. Concretely, Y.Text uses a variant of the YATA algorithm:
 * each character is linked to its left/right neighbors at insertion time,
 * so inserting "at position 5" really means "after this specific character
 * object", which stays well-defined even if other insertions/deletions
 * happened concurrently elsewhere in the document. There is no server, no
 * lock, and no negotiation involved — this is why the editor keeps working
 * correctly even though peers connect in a fully decentralized mesh.
 */
export default function Editor({ doc, awareness }) {
  const editorContainerRef = useRef(null)
  const quillRef = useRef(null)
  const bindingRef = useRef(null)

  useEffect(() => {
    if (!editorContainerRef.current || quillRef.current) return

    const quill = new Quill(editorContainerRef.current, {
      theme: 'snow',
      modules: {
        toolbar: [
          ['bold', 'italic', 'underline'],
          [{ list: 'ordered' }, { list: 'bullet' }],
          [{ header: [1, 2, false] }],
          ['clean']
        ]
      },
      placeholder: '✒️ Begin your quest log — every word syncs peer-to-peer, live...'
    })
    quillRef.current = quill

    // The Yjs shared type that backs this editor. All peers in the room
    // share this same logical Y.Text, kept consistent by the CRDT merge
    // rules described above.
    const ytext = doc.getText('quill-content')

    // QuillBinding keeps Quill's Delta-based edits and the Y.Text in sync
    // in both directions, and also renders remote cursors/selections using
    // `awareness` (each peer's cursor color/name comes from their
    // awareness state set in useYjsRoom.js).
    bindingRef.current = new QuillBinding(ytext, quill, awareness)

    return () => {
      bindingRef.current?.destroy()
      bindingRef.current = null
      quillRef.current = null
      if (editorContainerRef.current) {
        editorContainerRef.current.innerHTML = ''
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc, awareness])

  return (
    <div className="editor-wrapper">
      <div ref={editorContainerRef} className="editor" />
    </div>
  )
}
