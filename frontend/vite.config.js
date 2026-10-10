import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    // host: true binds to 0.0.0.0 so other devices on the same Wi-Fi
    // network can reach this dev server via your machine's LAN IP
    // (e.g. http://192.168.1.23:5173) — required for the cross-device
    // testing step in the README.
    host: true,
    port: 5173
  }
})
