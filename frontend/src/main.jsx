import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './styles.css'

// NOTE: intentionally NOT wrapped in <React.StrictMode>. StrictMode's dev-only
// double-invoke of effects (mount -> cleanup -> mount) is incompatible with
// the one-shot teardown of a WebrtcProvider/Y.Doc (destroy() is not meant to
// be followed by reuse) and would tear down a freshly-opened WebRTC session
// immediately after creating it. This is a known gotcha across the
// Yjs/y-webrtc ecosystem, not specific to this app. Flagged explicitly here
// per project requirements rather than silently working around it.
ReactDOM.createRoot(document.getElementById('root')).render(<App />)
