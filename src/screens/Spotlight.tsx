import { useEffect, useState } from 'react'
import { ArrowBigDown, ArrowBigUp, Flag, ShieldX, Sparkles, Trash2 } from 'lucide-react'
import { deletePost, getPosts, reportPost, takeDownPost, votePost } from '../api'
import { universityById } from '../data'
import { REPORT_REASONS, SPOTLIGHT_BONUSES, type Post, type ReportReason } from '../model'
import { useStore } from '../store'
import { Avatar, Sheet, timeAgo } from '../ui'

export default function Spotlight() {
  const { session, openCamera } = useStore()
  const [sort, setSort] = useState<'top' | 'new'>('top')
  const [posts, setPosts] = useState<Post[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [reporting, setReporting] = useState<Post | null>(null)
  const uni = universityById(session!.user.universityId)
  const isAdmin = !!session!.user.admin

  useEffect(() => {
    setPosts(null)
    setError(null)
    getPosts(sort).then(setPosts, (e: Error) => setError(e.message))
  }, [sort])

  const patch = (id: string, change: Partial<Post>) => setPosts((list) => list && list.map((p) => (p.id === id ? { ...p, ...change } : p)))
  const drop = (id: string) => setPosts((list) => list && list.filter((p) => p.id !== id))

  const vote = async (post: Post, dir: 1 | -1) => {
    const value = post.myVote === dir ? 0 : dir
    patch(post.id, { myVote: value, score: post.score - post.myVote + value })
    try {
      const { hidden, ...next } = await votePost(post.id, value)
      if (hidden) drop(post.id)
      else patch(post.id, next)
    } catch (e) {
      patch(post.id, post)
      alert((e as Error).message)
    }
  }

  const remove = async (post: Post) => {
    if (!confirm('Remove this from Spotlight?')) return
    try {
      await deletePost(post.id)
      drop(post.id)
    } catch (e) {
      alert((e as Error).message)
    }
  }

  const takeDown = async (post: Post) => {
    if (!confirm(`Take down ${post.name}’s post for everyone?`)) return
    try {
      await takeDownPost(post.id)
      drop(post.id)
    } catch (e) {
      alert((e as Error).message)
    }
  }

  const report = async (reason: ReportReason) => {
    const post = reporting!
    setReporting(null)
    try {
      await reportPost(post.id, reason)
      patch(post.id, { reported: true })
    } catch (e) {
      alert((e as Error).message)
    }
  }

  return (
    <div className="page">
      <div>
        <h1 className="title">Spotlight</h1>
        <p className="sub">The best green moments at {uni.short}.</p>
      </div>

      <div className="segment" role="tablist">
        <button role="tab" aria-selected={sort === 'top'} className={sort === 'top' ? 'is-on' : ''} onClick={() => setSort('top')}>
          Top this week
        </button>
        <button role="tab" aria-selected={sort === 'new'} className={sort === 'new' ? 'is-on' : ''} onClick={() => setSort('new')}>
          New
        </button>
      </div>

      {error ? (
        <p className="empty">{error}</p>
      ) : !posts ? (
        <div className="spot-loading">
          <span className="spinner" />
        </div>
      ) : !posts.length ? (
        <button className="empty-snap" onClick={openCamera}>
          <Sparkles size={26} />
          <strong>Nothing here yet</strong>
          <span>Share your next snap to be the first.</span>
        </button>
      ) : (
        <ul className="spots">
          {posts.map((p) => (
            <SpotCard
              key={p.id}
              post={p}
              onVote={(dir) => vote(p, dir)}
              onRemove={() => remove(p)}
              onReport={() => setReporting(p)}
              onTakeDown={isAdmin ? () => takeDown(p) : undefined}
            />
          ))}
        </ul>
      )}

      <Sheet open={!!reporting} onClose={() => setReporting(null)}>
        <div className="redeem">
          <h2 className="title-sm">Report this post</h2>
          <p className="sub">An admin will take a look. {reporting?.name} won’t know it was you.</p>
        </div>
        <ul className="menu report-reasons">
          {REPORT_REASONS.map((r) => (
            <li key={r.id}>
              <button onClick={() => report(r.id)}>{r.label}</button>
            </li>
          ))}
        </ul>
      </Sheet>
    </div>
  )
}

interface CardProps {
  post: Post
  onVote: (dir: 1 | -1) => void
  onRemove: () => void
  onReport: () => void
  onTakeDown?: () => void
}

function SpotCard({ post: p, onVote, onRemove, onReport, onTakeDown }: CardProps) {
  const next = SPOTLIGHT_BONUSES.find((b) => p.score < b.votes)
  return (
    <li className="spot">
      <header className="spot-head">
        <Avatar name={p.name} size={34} />
        <div>
          <strong>{p.name}</strong>
          <span>
            {p.emoji} {p.label} · {timeAgo(p.ts)}
          </span>
        </div>
        {onTakeDown && !p.mine && (
          <button className="icon-btn sm" onClick={onTakeDown} aria-label="Take down post">
            <ShieldX size={16} />
          </button>
        )}
        {p.mine ? (
          <button className="icon-btn sm" onClick={onRemove} aria-label="Remove from Spotlight">
            <Trash2 size={16} />
          </button>
        ) : (
          <button className={`icon-btn sm ${p.reported ? 'is-reported' : ''}`} onClick={onReport} disabled={p.reported} aria-label={p.reported ? 'Reported' : 'Report post'}>
            <Flag size={15} />
          </button>
        )}
      </header>

      <div className="spot-media">
        {p.kind === 'video' ? (
          <video src={p.url} poster={p.poster ?? undefined} controls playsInline loop muted preload="metadata" />
        ) : (
          <img src={p.url} alt={p.label} loading="lazy" />
        )}
      </div>

      <footer className="spot-foot">
        <div className="vote">
          <button className={`up ${p.myVote === 1 ? 'is-on' : ''}`} onClick={() => onVote(1)} disabled={p.mine} aria-label="Upvote" aria-pressed={p.myVote === 1}>
            <ArrowBigUp size={24} />
          </button>
          <strong className="num">{p.score}</strong>
          <button className={`down ${p.myVote === -1 ? 'is-on' : ''}`} onClick={() => onVote(-1)} disabled={p.mine} aria-label="Downvote" aria-pressed={p.myVote === -1}>
            <ArrowBigDown size={24} />
          </button>
        </div>
        {p.bonus > 0 && <span className="spot-bonus">+{p.bonus} bonus earned</span>}
        {p.mine && next && (
          <span className="spot-next">
            +{next.bonus} at {next.votes} upvotes
          </span>
        )}
      </footer>
    </li>
  )
}
