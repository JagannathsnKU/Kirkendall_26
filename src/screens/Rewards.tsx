import { useMemo, useState } from 'react'
import { Check, Lock } from 'lucide-react'
import { redeemReward } from '../api'
import { REWARDS, fmt, type Reward } from '../data'
import { useStore } from '../store'
import { Bar, QrArt, Sheet, ShopMark } from '../ui'
import AnimatedList from '../AnimatedList'
import SpecularButton from '../SpecularButton'

export default function Rewards() {
  const { session, refresh } = useStore()
  const { user, redemptions } = session!
  const [open, setOpen] = useState<Reward | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const code = open ? redemptions.find((r) => r.rewardId === open.id)?.code : undefined

  const redeem = async (r: Reward) => {
    setBusy(r.id)
    try {
      await redeemReward(r.id)
      await refresh()
      setOpen(r)
    } catch (e) {
      alert((e as Error).message)
    }
    setBusy(null)
  }

  const rows = useMemo(
    () =>
      REWARDS.map((r) => {
        const unlocked = user.points >= r.points
        const claimed = redemptions.some((x) => x.rewardId === r.id)
        const state = claimed ? 'is-claimed' : unlocked ? 'is-ready' : 'is-locked'
        return {
          id: r.id,
          reward: r,
          claimed,
          icon: <ShopMark name={r.shop} color={r.color} size={40} />,
          title: r.offer,
          description: (
            <span className={`reward-progress ${state}`}>
              <span className="reward-shop">{r.shop}</span>
              <Bar value={user.points} max={r.points} />
              <span className="reward-count num">
                {claimed ? 'Claimed' : unlocked ? 'Unlocked' : `${fmt(user.points)} / ${fmt(r.points)} pts`}
              </span>
            </span>
          ),
          meta: claimed ? (
            <span className="reward-pill is-claimed">
              <Check size={13} strokeWidth={2.6} /> View
            </span>
          ) : unlocked ? (
            <SpecularButton
              size="sm"
              disabled={busy === r.id}
              onClick={(e) => {
                e.stopPropagation()
                redeem(r)
              }}
            >
              {busy === r.id ? <span className="spinner" /> : 'Redeem'}
            </SpecularButton>
          ) : (
            <span className="reward-pill">
              <Lock size={12} /> {fmt(r.points - user.points)}
            </span>
          ),
        }
      }),
    [user.points, redemptions, busy],
  )

  return (
    <div className="page">
      <div>
        <h1 className="title">Rewards</h1>
        <p className="sub">
          Local discounts unlock as you earn. You have <strong className="num">{fmt(user.points)}</strong> points.
        </p>
      </div>

      <AnimatedList
        items={rows}
        theme="eco"
        animation="pop"
        stagger={0.04}
        selectOnHover={false}
        width="100%"
        maxHeight="calc(100dvh - 210px - var(--safe-top) - var(--safe-bottom))"
        className="rewards"
        onItemSelect={(row) => row.claimed && setOpen(row.reward)}
      />

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
