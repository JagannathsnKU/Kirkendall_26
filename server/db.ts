import postgres from 'postgres'
import { HttpError } from './http.ts'

const url = process.env.DATABASE_URL

// prepare: false because Neon's pooled URL goes through PgBouncer, which can't keep prepared statements.
const client = url
  ? postgres(url, { prepare: false, max: Number(process.env.DB_POOL) || 3, idle_timeout: 20, connect_timeout: 10, onnotice: () => {} })
  : null

export type Sql = NonNullable<typeof client>
/** Either the pool or a transaction. */
export type Query = postgres.ISql
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
  `alter table snaps add column if not exists kind text not null default 'photo'`,
  `create table if not exists posts (
    id text primary key,
    snap_id text not null unique references snaps (id) on delete cascade,
    user_id text not null references users (id) on delete cascade,
    university_id text not null,
    kind text not null,
    url text not null,
    poster text,
    label text not null,
    emoji text not null,
    score integer not null default 0,
    bonus integer not null default 0,
    ts bigint not null
  )`,
  `create index if not exists posts_school_ts on posts (university_id, ts desc)`,
  `create table if not exists votes (
    post_id text not null references posts (id) on delete cascade,
    user_id text not null references users (id) on delete cascade,
    value smallint not null,
    primary key (post_id, user_id)
  )`,
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
  `alter table users add column if not exists banned boolean not null default false`,
  `alter table users add column if not exists admin_seen_at bigint not null default 0`,
  `alter table posts add column if not exists hidden boolean not null default false`,
  `alter table posts add column if not exists reviewed boolean not null default false`,
  `create table if not exists reports (
    post_id text not null references posts (id) on delete cascade,
    user_id text not null references users (id) on delete cascade,
    reason text not null,
    ts bigint not null,
    primary key (post_id, user_id)
  )`,
  `create table if not exists events (
    id bigint generated always as identity primary key,
    user_id text not null references users (id) on delete cascade,
    actor_id text references users (id) on delete set null,
    kind text not null,
    detail text not null default '',
    ts bigint not null
  )`,
  `create index if not exists events_ts on events (ts desc)`,
  `create index if not exists events_user_ts on events (user_id, ts desc)`,
  `create table if not exists flags (
    id text primary key,
    kind text not null,
    user_id text not null references users (id) on delete cascade,
    post_id text references posts (id) on delete cascade,
    reason text not null,
    note text not null default '',
    ai_verdict text,
    ai_reason text,
    status text not null default 'open',
    decision text,
    resolved_by text,
    resolved_at bigint,
    ts bigint not null
  )`,
  `alter table snaps add column if not exists photo text not null default ''`,
  `alter table snaps add column if not exists impact text`,
  `alter table snaps add column if not exists headline text`,
  `alter table snaps add column if not exists analogy text`,
  `alter table snaps add column if not exists analogy_emoji text`,
  `create index if not exists snaps_ts on snaps (ts)`,
  // Snaps are deleted after a week; their fingerprints stay so old photos can't be reused.
  `create table if not exists photo_hashes (
    user_id text not null references users (id) on delete cascade,
    hash text not null,
    ts bigint not null,
    primary key (user_id, hash)
  )`,
  `insert into photo_hashes (user_id, hash, ts) select user_id, hash, ts from snaps where hash <> '' on conflict do nothing`,
  `create unique index if not exists flags_open_post on flags (post_id) where status = 'open'`,
  `create unique index if not exists flags_open_user on flags (user_id) where status = 'open' and kind = 'user'`,
  `create index if not exists flags_status_ts on flags (status, ts desc)`,
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
