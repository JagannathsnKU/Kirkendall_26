/* `npm run dev`: runs the API (port 8787) and the Vite app (port 5173) together. Ctrl+C stops both. */
import { spawn, type ChildProcess } from 'node:child_process'

const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm'
const children: ChildProcess[] = [
  spawn(npm, ['run', 'api'], { stdio: 'inherit' }),
  spawn(npm, ['run', 'web'], { stdio: 'inherit' }),
]

let stopping = false
function stop(code = 0) {
  if (stopping) return
  stopping = true
  for (const child of children) child.kill('SIGTERM')
  process.exit(code)
}

for (const child of children) child.on('exit', (code) => stop(code ?? 0))
process.on('SIGINT', () => stop())
process.on('SIGTERM', () => stop())
