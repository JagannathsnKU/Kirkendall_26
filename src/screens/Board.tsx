import { useEffect, useMemo, useState } from 'react'
import { getStudentLeaderboard, getUniversityLeaderboard, type StudentRow, type UniversityRow } from '../api'
import { fmt, universityById } from '../data'
import { useStore } from '../store'
import AnimatedList from '../AnimatedList'

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

  const rows = useMemo(
    () =>
      (tab === 'school' ? students : schools).map((s, i) => ({
        id: s.id,
        icon: <span className={`board-rank ${i < 3 ? `is-${i + 1}` : ''}`}>{i + 1}</span>,
        title: s.name,
        description: s.me ? (tab === 'school' ? 'You' : 'Your school') : undefined,
        meta: (
          <span className={`board-pts num ${s.me ? 'board-me' : ''}`}>
            {fmt(s.points)} <small>pts</small>
          </span>
        ),
      })),
    [tab, students, schools],
  )

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

      {rows.length > 0 && (
        <AnimatedList
          key={tab}
          items={rows}
          theme="eco"
          animation="pop"
          stagger={0.03}
          selectOnHover={false}
          width="100%"
          maxHeight="calc(100dvh - 250px - var(--safe-top) - var(--safe-bottom))"
          className="board"
        />
      )}
    </div>
  )
}
