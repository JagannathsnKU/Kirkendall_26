import { useEffect, useState } from 'react'
import { getStudentLeaderboard, getUniversityLeaderboard, type StudentRow, type UniversityRow } from '../api'
import { fmt, universityById } from '../data'
import { useStore } from '../store'
import { Avatar } from '../ui'

const MEDALS = ['🥇', '🥈', '🥉']

export default function Board() {
  const { session } = useStore()
  const [tab, setTab] = useState<'school' | 'schools'>('school')
  const [students, setStudents] = useState<StudentRow[]>([])
  const [schools, setSchools] = useState<UniversityRow[]>([])
  const uni = universityById(session!.user.universityId)

  const [offline, setOffline] = useState(false)

  useEffect(() => {
    getStudentLeaderboard().then(setStudents, () => setOffline(true))
    getUniversityLeaderboard().then(setSchools, () => setOffline(true))
  }, [session])

  const rows = (tab === 'school' ? students : schools).map((s) => ({ key: s.id, name: s.name, points: s.points, me: s.me }))

  return (
    <div className="page">
      <h1 className="title">Leaderboard</h1>

      <div className="segment" role="tablist">
        <button role="tab" aria-selected={tab === 'school'} className={tab === 'school' ? 'is-on' : ''} onClick={() => setTab('school')}>
          {uni.short}
        </button>
        <button role="tab" aria-selected={tab === 'schools'} className={tab === 'schools' ? 'is-on' : ''} onClick={() => setTab('schools')}>
          All schools
        </button>
      </div>

      {offline && !rows.length && <p className="empty">Connect to the internet to see the leaderboard.</p>}

      <ol className="board" key={tab}>
        {rows.map((r, i) => (
          <li key={r.key} className={r.me ? 'is-me' : ''} style={{ animationDelay: `${Math.min(i, 12) * 25}ms` }}>
            <span className="board-pos">{MEDALS[i] ?? i + 1}</span>
            {tab === 'school' && <Avatar name={r.name} size={32} />}
            <span className="board-name">
              {r.name}
              {r.me && tab === 'school' && <em>You</em>}
            </span>
            <span className="board-pts num">{fmt(r.points)}</span>
          </li>
        ))}
      </ol>
    </div>
  )
}
