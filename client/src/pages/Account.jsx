import { useState } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth, SignOut } from '../context/AuthContext'
import { api } from '../services/api'
import { Button, ErrorNotice, Field, Loading, Notice, Page } from '../components/ui'

export function Account({ role = 'STUDENT' }) {
  const auth = useAuth()
  const location = useLocation()
  const [mode, setMode] = useState(location.pathname === '/register' ? 'register' : 'login')
  const [form, setForm] = useState({ name: '', username: '', email: '', phone: '', password: '', confirm: '' })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const owner = role === 'OWNER'
  const update = key => event => setForm(current => ({ ...current, [key]: event.target.value }))
  if (auth.loading) return <Loading />
  if (auth.user) {
    if (owner && auth.user.role !== 'OWNER') return <Page title="An owner account is required"><SignOut /></Page>
    const from = location.state?.from
    const destination = typeof from === 'string' && from.startsWith('/') && !from.startsWith('//') && !['/login', '/register'].includes(from.split('?')[0]) ? from : owner ? '/dashboard' : auth.user.role === 'ADMIN' ? '/admin' : '/hostels'
    return <Navigate to={destination} replace />
  }
  async function submit(event) {
    event.preventDefault(); setError('')
    if (mode === 'register' && form.password !== form.confirm) { setError('Passwords do not match.'); return }
    setBusy(true)
    try {
      await auth.authenticate(mode, mode === 'login' ? { username: form.username.trim(), password: form.password } : { name: form.name.trim(), email: form.email.trim(), password: form.password, role, ...(form.username.trim() && { username: form.username.trim() }), ...(form.phone.trim() && { phone: form.phone.trim() }) })
    } catch (cause) { setError(cause.status === 409 ? 'That email or username is already registered. Please sign in or choose another.' : cause.message) }
    finally { setBusy(false) }
  }
  return <div className="min-h-[calc(100vh-68px)] lg:grid lg:grid-cols-[1fr_1.05fr]"><section className="relative hidden overflow-hidden bg-plan p-12 text-plan-text lg:flex lg:flex-col lg:justify-between"><div aria-hidden="true" className="absolute inset-0 bg-[linear-gradient(var(--color-plan-grid)_1px,transparent_1px),linear-gradient(90deg,var(--color-plan-grid)_1px,transparent_1px)] bg-[size:28px_28px] [mask-image:radial-gradient(ellipse_at_30%_40%,black,transparent_75%)]" /><p className="relative font-mono text-[11px] uppercase tracking-[.2em] text-[#8796a3]">HostelHub · {owner ? 'Owner portal' : 'Student and admin portal'}</p><div className="relative"><h1 className="max-w-lg text-[44px] font-semibold leading-[1.05] tracking-[-.035em]">{owner ? 'A better home for your hostel business.' : 'Find a place that feels like home.'}</h1><p className="mt-5 max-w-md text-[15px] leading-7 text-[#9aa7b2]">{owner ? 'Manage your listings and connect with students in one place.' : 'Save your favorite spaces, pick a room on the floor plan and talk directly to owners.'}</p></div><p className="relative text-xs text-[#6b7884]">Approved listings only · Secure sign-in</p></section><main className="flex items-center justify-center px-5 py-14"><div className="rise w-full max-w-[420px]"><p className="eyebrow">{mode === 'register' ? 'Create your account' : 'Welcome back'}</p><h1 className="page-title mt-3">{mode === 'register' ? 'Register.' : 'Sign in.'}</h1><ErrorNotice retry={auth.retry}>{auth.error}</ErrorNotice><form onSubmit={submit} className="mt-8 grid gap-4">
    {mode === 'register' && <><Field label="Full name"><input className="input" autoComplete="name" required maxLength={100} value={form.name} onChange={update('name')} /></Field><Field label="Email"><input className="input" type="email" autoComplete="email" required maxLength={254} value={form.email} onChange={update('email')} /></Field>{owner && <Field label="Phone number"><input className="input" type="tel" autoComplete="tel" maxLength={30} value={form.phone} onChange={update('phone')} /></Field>}</>}
    <Field label={mode === 'login' ? 'Username or email' : `Username${owner ? '' : ' (optional)'}`}><input className="input" autoComplete="username" required={mode === 'login' || owner} maxLength={mode === 'login' ? 254 : 24} pattern={mode === 'register' ? '[a-zA-Z0-9_]{3,24}' : undefined} title={mode === 'register' ? '3–24 letters, numbers or underscores' : undefined} value={form.username} onChange={update('username')} /></Field>
    <Field label="Password"><input className="input" type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} required minLength={mode === 'register' ? 10 : 1} maxLength={72} value={form.password} onChange={update('password')} /></Field>{mode === 'register' && <Field label="Confirm password"><input className="input" type="password" autoComplete="new-password" required value={form.confirm} onChange={update('confirm')} /></Field>}
    <ErrorNotice>{error}</ErrorNotice><Button disabled={busy} className="mt-2 min-h-12">{busy ? 'Please wait…' : mode === 'login' ? 'Sign in' : `Create ${owner ? 'owner' : 'student'} account`}</Button></form><p className="mt-6 border-t border-line pt-6 text-sm text-muted">{mode === 'login' ? 'New to HostelHub? ' : 'Already have an account? '}<button className="font-medium text-accent underline-offset-2 hover:underline" onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError('') }}>{mode === 'login' ? 'Create an account' : 'Already registered? Sign in'}</button></p></div></main></div>
}
export function Profile() {
  const { user, setUser } = useAuth()
  const [name, setName] = useState(user.name)
  const [phone, setPhone] = useState(user.phone || '')
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  const [busy, setBusy] = useState(false)
  async function save(event) { event.preventDefault(); setBusy(true); setSaved(false); setError(''); try { const result = await api('/auth/me', { method: 'PATCH', body: { name: name.trim(), phone: phone.trim() } }); setUser(result.data); setSaved(true) } catch (cause) { setError(cause.message) } finally { setBusy(false) } }
  return <Page eyebrow="Account" title="Your profile." description="Keep your contact information up to date."><form onSubmit={save} className="panel rise grid max-w-xl gap-5"><Field label="Full name"><input className="input" required maxLength={100} value={name} onChange={event => { setName(event.target.value); setSaved(false) }} /></Field><Field label="Email"><input className="input" value={user.email} readOnly /></Field><Field label="Phone"><input className="input" type="tel" maxLength={30} value={phone} onChange={event => { setPhone(event.target.value); setSaved(false) }} /></Field><p className="text-sm text-muted">Account type: <span className="font-mono text-xs font-medium text-ink">{user.role}</span></p><ErrorNotice>{error}</ErrorNotice><Notice>{saved && 'Your profile has been saved.'}</Notice><Button disabled={busy} className="justify-self-start">{busy ? 'Saving…' : 'Save changes'}</Button></form></Page>
}
