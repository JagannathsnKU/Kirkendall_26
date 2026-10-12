import { useState } from 'react'
import { Lock } from 'lucide-react'
import { redeemReward } from '../api'
import { REWARDS, fmt, type Reward } from '../data'
import { useStore } from '../store'
import { Bar, QrArt, Sheet, ShopMark } from '../ui'

export default function Rewards() {
  const { session, refresh } = useStore()
  const { user, redemptions } = session!
  const [open, setOpen] = useState<Reward | null>(null)
  const code = open ? redemptions.find((r) => r.rewardId === open.id)?.code : undefined

  const redeem = async (r: Reward) => {
    try {
      await redeemReward(r.id)
    } catch (e) {
      alert((e as Error).message)
      return
    }
    await refresh()
    setOpen(r)
  }

  return (
    <div className="page">
      <h1 className="title">Rewards</h1>
      <p className="sub">
        Local discounts unlock as you earn. You have <strong className="num">{fmt(user.points)}</strong> points.
      </p>

      <ul className="rewards">
        {REWARDS.map((r) => {
          const unlocked = user.points >= r.points
          const claimed = redemptions.some((x) => x.rewardId === r.id)
          return (
            <li key={r.id} className={`reward ${unlocked ? '' : 'is-locked'}`}>
              <ShopMark name={r.shop} color={r.color} />
              <div className="reward-text">
                <strong>{r.offer}</strong>
                <span>{r.shop}</span>
                {!unlocked && <Bar value={user.points} max={r.points} />}
              </div>
              {claimed ? (
                <button className="btn btn-sm btn-soft" onClick={() => setOpen(r)}>
                  View
                </button>
              ) : unlocked ? (
                <button className="btn btn-sm btn-primary" onClick={() => redeem(r)}>
                  Redeem
                </button>
              ) : (
                <span className="reward-need num">
                  <Lock size={12} /> {fmt(r.points)}
                </span>
              )}
            </li>
          )
        })}
      </ul>

      <Sheet open={!!open} onClose={() => setOpen(null)}>
        {open && code && (
          <div className="redeem">
            <ShopMark name={open.shop} color={open.color} size={56} />
            <h2 className="title-sm">{open.offer}</h2>
            <p className="sub">Show this at {open.shop}</p>
            <div className="qr">
              <QrArt seed={code} />
              <code>{code}</code>
            </div>
            <button className="btn btn-soft btn-block" onClick={() => setOpen(null)}>
              Done
            </button>
          </div>
        )}
      </Sheet>
    </div>
  )
}
