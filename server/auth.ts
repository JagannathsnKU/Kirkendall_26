import { createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto'
import type { IncomingMessage } from 'node:http'
import { promisify } from 'node:util'
import type { Sql } from './db.ts'
import { HttpError } from './http.ts'

const scryptAsync = promisify(scrypt) as (password: string, salt: Buffer, length: number) => Promise<Buffer>
const KEY_LENGTH = 64
const DUMMY = `scrypt$${'0'.repeat(32)}$${'0'.repeat(KEY_LENGTH * 2)}`

export async function hashPassword(password: string) {
  const salt = randomBytes(16)
  const key = await scryptAsync(password, salt, KEY_LENGTH)
  return `scrypt$${salt.toString('hex')}$${key.toString('hex')}`
}

/** Pass `null` for an unknown email so the response takes just as long. */
export async function checkPassword(password: string, stored: string | null) {
  const [, salt, key] = (stored ?? DUMMY).split('$')
  const got = await scryptAsync(password, Buffer.from(salt, 'hex'), KEY_LENGTH)
  return timingSafeEqual(got, Buffer.from(key, 'hex')) && stored !== null
}

/** Only a hash of the token is stored, so a leaked database can't be used to sign in. */
const hashToken = (token: string) => createHash('sha256').update(token).digest('hex')

export async function startSession(sql: Sql, userId: string) {
  const token = randomBytes(32).toString('base64url')
  await sql`insert into sessions (token, user_id) values (${hashToken(token)}, ${userId})`
  return token
}

const bearer = (req: IncomingMessage) => /^Bearer (\S+)$/.exec(req.headers.authorization ?? '')?.[1]

export async function requireUser(sql: Sql, req: IncomingMessage): Promise<string> {
  const token = bearer(req)
  const [row] = token ? await sql<{ user_id: string }[]>`select user_id from sessions where token = ${hashToken(token)}` : []
  if (!row) throw new HttpError(401, 'Please log in again.')
  return row.user_id
}

export async function endSession(sql: Sql, req: IncomingMessage) {
  const token = bearer(req)
  if (token) await sql`delete from sessions where token = ${hashToken(token)}`
}
