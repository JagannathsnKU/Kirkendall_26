/* Vercel entry. Every /api/* request is routed here (see scripts/vercel-output.ts). */
import type { IncomingMessage, ServerResponse } from 'node:http'
import { handle } from './app.ts'

export default function (req: IncomingMessage, res: ServerResponse) {
  const path = new URL(req.url ?? '/', 'http://localhost').searchParams.get('__path')
  if (path !== null) req.url = `/api/${path}`
  return handle(req, res)
}
