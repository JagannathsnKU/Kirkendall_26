import { ArrowRight } from 'lucide-react'
import Aurora from '../Aurora'
import { go } from '../router'
import { LogoMark } from '../ui'
import SpecularButton from '../SpecularButton'

export default function Welcome() {
  return (
    <div className="welcome">
      <Aurora
        className="welcome-aurora"
        colorStops={['#6ee7b7', '#10b981', '#5eead4', '#a7f3d0']}
        amplitude={1.2}
        blend={0.7}
        height={0.55}
        speed={0.35}
        glow={0.8}
        layers={2}
        lightMode
      />
      <div className="welcome-brand">
        <LogoMark size={32} />
        <span>EcoU</span>
      </div>
      <div className="welcome-copy">
        <p className="welcome-kicker">For college students</p>
        <h1 className="welcome-title">Small actions, big impact.</h1>
        <p className="welcome-sub">Improve your sustainability.</p>
      </div>
      <div className="welcome-actions">
        <SpecularButton className="btn-block" autoAnimate onClick={() => go('setup')}>
          Get started <ArrowRight size={18} />
        </SpecularButton>
        <button className="welcome-login" onClick={() => go('login')}>
          I already have an account
        </button>
      </div>
    </div>
  )
}
