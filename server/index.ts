import { createServer } from 'node:http'
import { handle } from './app.ts'
import { dbConfigured } from './db.ts'
import { ANTI_CHEAT } from './verify.ts'

const PORT = Number(process.env.PORT) || 8787

createServer(handle).listen(PORT, () => {
  const mode = process.env.VERIFY_MOCK === '1' ? 'MOCK (every photo passes)' : process.env.GEMINI_API_KEY ? 'Gemini' : 'NOT CONFIGURED (set GEMINI_API_KEY)'
  const db = dbConfigured ? 'connected' : 'NOT CONFIGURED (set DATABASE_URL)'
  console.log(`EcoU API on http://localhost:${PORT} · verification: ${mode} · database: ${db} · anti-cheat: ${ANTI_CHEAT ? 'on' : 'OFF (testing)'}`)
})
