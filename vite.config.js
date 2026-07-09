import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // Pinned so the OAuth redirect URI (registered in Google Cloud as
    // http://localhost:5174/integrations/oauth/callback) always matches.
    // strictPort makes dev fail loudly instead of silently bumping to 5175+.
    port: 5174,
    strictPort: true,
  },
})
