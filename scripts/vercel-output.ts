/*
 * Packages the built app for Vercel (Build Output API v3): dist/ becomes static files,
 * and the API is bundled into one Node function that serves every /api/* route.
 * Vercel deploys .vercel/output as-is when the build command produces it.
 */
import { cp, rm, writeFile } from 'node:fs/promises'
import { build } from 'rolldown'

const OUT = '.vercel/output'
const FUNCTION = `${OUT}/functions/api.func`

await rm(OUT, { recursive: true, force: true })
await cp('dist', `${OUT}/static`, { recursive: true })

await build({
  input: 'server/vercel.ts',
  platform: 'node',
  logLevel: 'warn',
  output: { file: `${FUNCTION}/index.mjs`, format: 'esm', codeSplitting: false },
})

const json = (value: unknown) => JSON.stringify(value, null, 2)

await writeFile(
  `${FUNCTION}/.vc-config.json`,
  json({ runtime: 'nodejs22.x', handler: 'index.mjs', launcherType: 'Nodejs', shouldAddHelpers: false, maxDuration: 30 }),
)

await writeFile(
  `${OUT}/config.json`,
  json({
    version: 3,
    routes: [
      { src: '^/assets/(.*)$', headers: { 'Cache-Control': 'public, max-age=31536000, immutable' }, continue: true },
      { src: '^/sw\\.js$', headers: { 'Cache-Control': 'no-cache' }, continue: true },
      { handle: 'filesystem' },
      { src: '^/api/(.*)$', dest: '/api?__path=$1' },
    ],
  }),
)

console.log(`Vercel output ready in ${OUT}`)
