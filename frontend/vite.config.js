import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react()],
  server: {
    // Vite rejects any request whose Host header isn't localhost/127.0.0.1/
    // an explicitly listed host, which blocks a tunnel (ngrok, etc.)
    // proxying to this dev server -- the tunnel's domain is a different
    // Host header on every request. Dev-server-only setting; irrelevant to
    // the production build (vite build / preview don't use this config).
    allowedHosts: true,
  },
  test: {
    environment: 'jsdom',
    setupFiles: './src/test/setup.js',
    globals: true,
    // The default 'forks' pool spawns a new child process per test file.
    // On some Windows machines, process-spawn overhead causes later
    // workers to time out starting ("Failed to start forks worker") even
    // though nothing is actually wrong -- the file-under-test is fine, the
    // test runner just never got a chance to run it. 'threads' uses
    // worker_threads instead of child_process.fork, which starts far
    // faster and avoids this entirely.
    pool: 'threads',
  },
})
