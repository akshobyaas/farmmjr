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
    // Lets a single ngrok tunnel (on this port, 5173) serve both the
    // frontend and the API: Vite forwards anything under /api or /media
    // to the local Django dev server itself, so the browser never talks
    // to the backend directly -- no second tunnel, no CORS, no Django
    // ALLOWED_HOSTS entry needed for the tunnel's domain at all, since as
    // far as Django's concerned the request is just from localhost. Only
    // relevant when VITE_API_BASE_URL is set to a relative path (e.g.
    // "/api/") instead of a full URL -- see .env.example.
    proxy: {
      '/api': { target: 'http://localhost:8000', changeOrigin: true },
      '/media': { target: 'http://localhost:8000', changeOrigin: true },
    },
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
