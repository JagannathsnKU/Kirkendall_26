import { useEffect } from 'react'
import { ArrowUp, Check, Trophy } from 'lucide-react'
import { universityById } from '../data'
import { go } from '../router'
import { useStore } from '../store'
import { CountUp } from '../ui'

export default function Result() {
  const { result, setResult, session } = useStore()

  useEffect(() => {
    if (!result) go('home', { replace: true })
  }, [result])

  if (!result || !session) return null
  const { action } = result
  const uni = universityById(session.user.universityId)
  const climbed = result.rankBefore - result.rankAfter

  const done = () => {
    setResult(null)
    go('home', { replace: true })
  }

  return (
    <div className="result">
      <div className="result-photo r1">
        <img src={result.thumb} alt="" />
        <span className="result-check">
          <Check size={18} strokeWidth={3.2} />
        </span>
      </div>

      <p className="result-points r2">
        <span>
          +<CountUp value={result.points} delay={250} duration={700} />
        </span>
        <span className="result-unit">points</span>
      </p>

      {result.streak.extended && (
        <p className="result-streak r2">
          🔥 {result.streak.count}-day streak
          {result.streak.bonus > 0 && <strong>+{result.streak.bonus} bonus</strong>}
          {result.streak.freezeEarned && <span>❄️ Freeze earned</span>}
          {result.streak.freezesUsed > 0 && <span>❄️ Freeze saved it</span>}
        </p>
      )}

      {result.spotlight && (
        <p className={`result-spotlight r2 ${result.spotlight === 'failed' ? 'is-failed' : ''}`}>
          {result.spotlight === 'shared' ? `✨ Shared to ${uni.short}’s Spotlight` : 'Couldn’t share to Spotlight, but your points count.'}
        </p>
      )}

      <section className="analogy r3">
        <span className="analogy-emoji">{action.analogyEmoji}</span>
        <p className="analogy-text">{action.analogy}</p>
        <p className="analogy-fact">{action.headline}</p>
      </section>

      <section className="result-rank r4">
        <Trophy size={20} />
        <div>
          <strong>
            #{result.rankAfter} at {uni.short}
          </strong>
          <span>
            {uni.short} is #{result.universityRank} of all schools
          </span>
        </div>
        {climbed > 0 && (
          <span className="climb">
            <ArrowUp size={14} strokeWidth={3} />
            {climbed}
          </span>
        )}
      </section>

      <div className="result-foot r5">
        <button className="btn btn-primary btn-block" onClick={done}>
          Done
        </button>
      </div>
    </div>
  )
}
