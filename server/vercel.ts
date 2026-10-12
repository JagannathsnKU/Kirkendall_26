/* Vercel entry. Every /api/* request is routed here (see scripts/vercel-output.ts). */
import type { IncomingMessage, ServerResponse } from 'node:http'
import { handle } from './app.ts'

export default function (req: IncomingMessage, res: ServerResponse) {
  const url = new URL(req.url ?? '/', 'http://localhost')
  const path = url.searchParams.get('__path')
  if (path !== null) {
    url.searchParams.delete('__path')
    req.url = `/api/${path}${url.search}`
  }
  return handle(req, res)
}
