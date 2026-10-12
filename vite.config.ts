import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

const api = { '/api': 'http://127.0.0.1:8787' }

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  return {
    plugins: [react()],
    define: { __ANTI_CHEAT__: JSON.stringify(env.ANTI_CHEAT !== '0') },
    server: { proxy: api, watch: { ignored: ['**/.vercel/**'] } },
    preview: { proxy: api },
  }
})
