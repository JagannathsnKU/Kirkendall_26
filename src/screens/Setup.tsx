import { useState, type FormEvent } from 'react'
import { Check, ChevronLeft, Search } from 'lucide-react'
import { logIn, signUp, updateProfile } from '../api'
import { UNIVERSITIES } from '../data'
import { go } from '../router'
import { useStore } from '../store'

type Mode = 'join' | 'login' | 'edit'

export default function Setup({ login = false }: { login?: boolean }) {
  const { session, refresh } = useStore()
  const mode: Mode = session ? 'edit' : login ? 'login' : 'join'
  const [name, setName] = useState(session?.user.name ?? '')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [uni, setUni] = useState(session?.user.universityId ?? '')
  const [query, setQuery] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const q = query.trim().toLowerCase()
  const list = UNIVERSITIES.filter((u) => u.name.toLowerCase().includes(q) || u.short.toLowerCase().includes(q))
  const ready =
    mode === 'login'
      ? !!email.trim() && !!password
      : !!name.trim() && !!uni && (mode === 'edit' || (!!email.trim() && password.length >= 8))

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!ready || busy) return
    setBusy(true)
    setError(null)
    try {
      if (mode === 'edit') await updateProfile(name.trim(), uni)
      else if (mode === 'login') await logIn(email.trim(), password)
      else await signUp({ name: name.trim(), email: email.trim(), password, universityId: uni })
      await refresh()
      go(mode === 'edit' ? 'me' : 'home', { replace: true })
    } catch (err) {
      setError((err as Error).message)
      setBusy(false)
    }
  }

  return (
    <form className="setup" onSubmit={submit}>
      <button type="button" className="icon-btn" onClick={() => go(mode === 'edit' ? 'me' : 'welcome')} aria-label="Back">
        <ChevronLeft size={22} />
      </button>
      <h1 className="title">{mode === 'edit' ? 'Edit profile' : mode === 'login' ? 'Welcome back' : 'Join EcoU'}</h1>

      {mode !== 'login' && (
        <label className="field">
          <span>Name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="First name" maxLength={24} autoComplete="given-name" />
        </label>
      )}

      {mode !== 'edit' && (
        <>
          <label className="field">
            <span>Email</span>
            <input
              type="email"
              inputMode="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@school.edu"
              maxLength={254}
              autoComplete="email"
              autoCapitalize="none"
            />
          </label>
          <label className="field">
            <span>Password</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={mode === 'join' ? 'At least 8 characters' : 'Password'}
              maxLength={200}
              autoComplete={mode === 'join' ? 'new-password' : 'current-password'}
            />
          </label>
        </>
      )}

      {mode !== 'login' && (
        <div className="field">
          <span>University</span>
          <div className="search">
            <Search size={18} />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search" />
          </div>
          <ul className="uni-list">
            {list.map((u) => (
              <li key={u.id}>
                <button type="button" className={`uni ${uni === u.id ? 'is-on' : ''}`} onClick={() => setUni(u.id)}>
                  {u.name}
                  {uni === u.id && <Check size={18} strokeWidth={3} />}
                </button>
              </li>
            ))}
            {!list.length && <li className="empty">No match yet. More schools coming soon.</li>}
          </ul>
        </div>
      )}

      <div className="setup-foot">
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <button type="submit" className="btn btn-primary btn-block" disabled={!ready || busy}>
          {busy ? <span className="spinner" /> : mode === 'edit' ? 'Save' : mode === 'login' ? 'Log in' : 'Join'}
        </button>
        {mode !== 'edit' && (
          <button type="button" className="setup-switch" onClick={() => go(mode === 'login' ? 'setup' : 'login', { replace: true })}>
            {mode === 'login' ? 'New here? Create an account' : 'Already have an account? Log in'}
          </button>
        )}
      </div>
    </form>
  )
}
