import postgres from 'postgres'
import { HttpError } from './http.ts'

const url = process.env.DATABASE_URL

// prepare: false because Neon's pooled URL goes through PgBouncer, which can't keep prepared statements.
const client = url
  ? postgres(url, { prepare: false, max: Number(process.env.DB_POOL) || 3, idle_timeout: 20, connect_timeout: 10, onnotice: () => {} })
  : null

export type Sql = NonNullable<typeof client>
export const dbConfigured = !!client

const SCHEMA = [
  `create table if not exists users (
    id text primary key,
    email text not null unique,
    password text not null,
    name text not null,
    university_id text not null,
    points integer not null default 0,
    co2 double precision not null default 0,
    kwh double precision not null default 0,
    water integer not null default 0,
    plastic integer not null default 0,
    streak text not null,
    created_at timestamptz not null default now()
  )`,
  `create index if not exists users_school_points on users (university_id, points desc)`,
  `create table if not exists sessions (
    token text primary key,
    user_id text not null references users (id) on delete cascade,
    created_at timestamptz not null default now()
  )`,
  `create table if not exists snaps (
    id text primary key,
    user_id text not null references users (id) on delete cascade,
    action_id text not null,
    label text not null,
    emoji text not null,
    points integer not null,
    day text not null,
    ts bigint not null,
    thumb text not null,
    hash text not null default ''
  )`,
  `create index if not exists snaps_user_ts on snaps (user_id, ts desc)`,
  `create table if not exists redemptions (
    user_id text not null references users (id) on delete cascade,
    reward_id text not null,
    code text not null,
    ts bigint not null,
    primary key (user_id, reward_id)
  )`,
  `create table if not exists attempts (
    user_id text not null references users (id) on delete cascade,
    ts bigint not null
  )`,
  `create index if not exists attempts_user_ts on attempts (user_id, ts)`,
]

let ready: Promise<Sql> | null = null

/** The database, with tables created on first use. */
export function db(): Promise<Sql> {
  if (!client) return Promise.reject(new HttpError(503, 'The database isn’t set up yet.'))
  ready ??= client
    .begin(async (tx) => {
      await tx.unsafe('select pg_advisory_xact_lock(4242)')
      for (const statement of SCHEMA) await tx.unsafe(statement)
    })
    .then(() => client)
    .catch((e) => {
      ready = null
      throw e
    })
  return ready
}
