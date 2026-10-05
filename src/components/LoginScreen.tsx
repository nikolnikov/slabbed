import { useState } from 'react'
import type { FormEvent } from 'react'
import logo from '../assets/logo.avif'

type LoginScreenProps = {
  mode: 'login' | 'register'
  onModeChange: (mode: 'login' | 'register') => void
  onSubmit: (values: { name: string; email: string; password: string; rememberMe: boolean }) => void
  error: string | null
  submitting: boolean
}

export function LoginScreen({ mode, onModeChange, onSubmit, error, submitting }: LoginScreenProps) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [rememberMe, setRememberMe] = useState(true)
  const registering = mode === 'register'

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault()
    onSubmit({ name, email, password, rememberMe })
  }

  return (
    <div className="auth-screen">
      <img className="auth-screen__logo" src={logo} alt="Slabbbed!" />
      <form className="auth-form" onSubmit={handleSubmit}>
        {registering && (
          <input
            className="field__input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoComplete="name"
            placeholder="Name"
            required
          />
        )}
        <input
          className="field__input"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
          placeholder="Email"
          required
        />
        <input
          className="field__input"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete={registering ? 'new-password' : 'current-password'}
          placeholder={registering ? 'Password (8+ characters)' : 'Password'}
          minLength={registering ? 8 : undefined}
          required
        />
        <label className="checkbox">
          <input type="checkbox" checked={rememberMe} onChange={(e) => setRememberMe(e.target.checked)} />
          <span>Remember me</span>
        </label>
        {error && <p className="notice notice--error notice--flush" role="alert">{error}</p>}
        <button type="submit" className="button button--primary" disabled={submitting}>
          {registering ? (submitting ? 'Creating account…' : 'Create account') : submitting ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
      <p className="auth-screen__switch">
        {registering ? 'Already have an account?' : 'New to Slabbbed?'}{' '}
        <button type="button" className="link-button" onClick={() => onModeChange(registering ? 'login' : 'register')}>
          {registering ? 'Sign in' : 'Create an account'}
        </button>
      </p>
    </div>
  )
}
