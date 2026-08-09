import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// The demo build (VITE_DEMO_MODE=true) is the only one that should contain
// src/demo/* — the fake Supabase client, the local AI, and the Ken42 dataset.
// Dead-code elimination alone does not remove them (the dataset modules are not
// side-effect-free from Rollup's point of view), so normal builds ALIAS the four
// demo entry points to a throwing stub. See src/demo/README.md.
const DEMO_MODULES = /^\.\.\/demo\/(client|edge|ai|website)$/

// https://vite.dev/config/
export default defineConfig(() => {
  const isDemo = process.env.VITE_DEMO_MODE === 'true'
  const stub = fileURLToPath(new URL('./src/demo/stub.js', import.meta.url))

  return {
    plugins: [react()],
    resolve: {
      alias: isDemo ? [] : [{ find: DEMO_MODULES, replacement: stub }],
    },
    server: {
      // Pinned so the OAuth redirect URI (registered in Google Cloud as
      // http://localhost:5174/integrations/oauth/callback) always matches.
      // strictPort makes dev fail loudly instead of silently bumping to 5175+.
      port: 5174,
      strictPort: true,
    },
  }
})
