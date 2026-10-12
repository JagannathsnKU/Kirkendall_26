import { ArrowRight } from 'lucide-react'
import { go } from '../router'

export default function Welcome() {
  return (
    <div className="welcome">
      <div className="welcome-art" aria-hidden>
        <img src="/icons/icon.svg" width={88} height={88} alt="" />
        <span className="float f1">📸 Snap</span>
        <span className="float f2">🌍 Impact</span>
        <span className="float f3">🏆 Compete</span>
      </div>
      <h1 className="welcome-title">EcoU</h1>
      <p className="welcome-sub">Snap green actions. See your impact. Beat other schools.</p>
      <button className="btn btn-primary btn-block" onClick={() => go('setup')}>
        Get started <ArrowRight size={18} />
      </button>
      <button className="setup-switch" onClick={() => go('login')}>
        I already have an account
      </button>
    </div>
  )
}
