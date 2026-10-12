import { useState, type FormEvent } from 'react'
import { ChevronLeft, MailCheck } from 'lucide-react'
import { requestPasswordReset, resetPassword } from '../api'
import { go } from '../router'
import { useStore } from '../store'
import SpecularButton from '../SpecularButton'

/** "Forgot password" sends the email; the link in it opens this screen again with a token to set the new password. */
export default function Reset({ token }: { token?: string }) {
  const { refresh } = useStore()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [sent, setSent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const ready = token ? password.length >= 8 : !!email.trim()

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!ready || busy) return
    setBusy(true)
    setError(null)
    try {
      if (token) {
        await resetPassword(token, password)
        await refresh()
        go('home', { replace: true })
        return
      }
      await requestPasswordReset(email.trim())
      setSent(true)
    } catch (err) {
      setError((err as Error).message)
    }
    setBusy(false)
  }

  return (
    <form className="setup" onSubmit={submit}>
      <button type="button" className="icon-btn" onClick={() => go('login', { replace: true })} aria-label="Back to log in">
        <ChevronLeft size={22} />
      </button>

      {sent ? (
        <div className="reset-sent">
          <span className="reset-icon">
            <MailCheck size={26} />
          </span>
          <h1 className="title">Check your email</h1>
          <p className="sub">
            If <strong>{email.trim()}</strong> has an EcoU account, a link to reset your password is on its way. It expires in an hour.
          </p>
        </div>
      ) : (
        <>
          <div>
            <h1 className="title">{token ? 'Choose a new password' : 'Forgot password?'}</h1>
            <p className="sub reset-sub">
              {token ? 'You’ll be logged out on your other devices.' : 'Enter the email you signed up with and we’ll send you a link to reset it.'}
            </p>
          </div>
          {token ? (
            <label className="field">
              <span>New password</span>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 8 characters"
                maxLength={200}
                autoComplete="new-password"
                autoFocus
              />
            </label>
          ) : (
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
                autoFocus
              />
            </label>
          )}
        </>
      )}

      <div className="setup-foot">
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        {sent ? (
          <>
            <SpecularButton type="button" className="btn-block" onClick={() => go('login', { replace: true })}>
              Back to log in
            </SpecularButton>
            <button type="button" className="setup-switch" onClick={() => setSent(false)}>
              Didn’t get it? Try again
            </button>
          </>
        ) : (
          <SpecularButton type="submit" className="btn-block" disabled={!ready || busy}>
            {busy ? <span className="spinner" /> : token ? 'Save and log in' : 'Send reset link'}
          </SpecularButton>
        )}
      </div>
    </form>
  )
}
