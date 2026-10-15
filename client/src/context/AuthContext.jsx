import { createContext, useContext, useEffect, useState } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { authApi } from '../services/api'
import { Button, ErrorNotice, Loading, Page } from '../components/ui'

const AuthContext = createContext(null)
export const useAuth = () => useContext(AuthContext)
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    setLoading(true); setError('')
    authApi.me({ signal: controller.signal }).then(result => { if (!controller.signal.aborted) setUser(result.data) }).catch(cause => {
      if (!controller.signal.aborted) { setUser(null); if (cause.status !== 401) setError(cause.message) }
    }).finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [attempt])
  useEffect(() => {
    const expired = () => setUser(null)
    window.addEventListener('session-expired', expired)
    return () => window.removeEventListener('session-expired', expired)
  }, [])
  async function authenticate(mode, body) {
    await authApi[mode](body)
    try { const result = await authApi.me(); setUser(result.data); setError(''); return result.data }
    catch (cause) { if (cause.status === 401) throw new Error('Your sign-in session could not be saved. Allow site cookies and try signing in again.'); throw cause }
  }
  async function logout() {
    try { await authApi.logout() } catch (cause) { if (cause.status !== 401) throw cause }
    setUser(null)
  }
  return <AuthContext.Provider value={{ user, setUser, loading, error, authenticate, logout, retry: () => setAttempt(value => value + 1) }}>{children}</AuthContext.Provider>
}
export function SignOut() {
  const { logout } = useAuth()
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  return <div><Button secondary disabled={busy} onClick={async () => { setBusy(true); setError(''); try { await logout() } catch (cause) { setError(cause.message) } finally { setBusy(false) } }}>Sign out</Button><ErrorNotice>{error}</ErrorNotice></div>
}
const staffRoles = ['ADMIN', 'SUPERADMIN']
const trim = url => url?.replace(/\/$/, '')
// Students use the student site; owners and staff use the owner portal. Both share one API session,
// so an account that signs in on the wrong portal is handed to the right one already signed in.
export const portals = {
  student: { name: 'the student site', url: trim(import.meta.env.VITE_STUDENT_SITE_URL) },
  owner: { name: 'the owner portal', url: trim(import.meta.env.VITE_OWNER_PORTAL_URL || 'https://hostel-site-user.vercel.app') },
}
export const portalOf = role => role === 'STUDENT' ? 'student' : 'owner'
const homePath = role => role === 'STUDENT' ? '/hostels' : staffRoles.includes(role) ? '/admin' : '/dashboard'
const roleNames = { STUDENT: 'a student', OWNER: 'an owner', ADMIN: 'an administrator', SUPERADMIN: 'a super administrator' }
export function PortalHandoff({ user }) {
  const portal = portals[portalOf(user.role)]
  const target = portal.url && `${portal.url}${homePath(user.role)}`
  useEffect(() => { if (target) window.location.replace(target) }, [target])
  return <Page eyebrow="Different portal" title={target ? `Taking you to ${portal.name}…` : `This account uses ${portal.name}`} description={`You're signed in as ${roleNames[user.role] || 'a user'}. ${user.role === 'STUDENT' ? 'Student accounts find and request rooms on the student site.' : 'Owner and admin accounts manage listings on the owner portal.'}`}>
    <div className="flex flex-wrap items-start gap-3">{target && <a href={target} className="action-link">Open {portal.name}</a>}<SignOut /></div>
  </Page>
}
export function RequireRole({ roles, children }) {
  const { user, loading, error, retry } = useAuth()
  const location = useLocation()
  if (loading) return <Loading />
  if (error) return <Page title="Unable to load your account"><ErrorNotice retry={retry}>{error}</ErrorNotice></Page>
  if (!user) return <Navigate to="/login" state={{ from: location.pathname + location.search }} replace />
  if (!roles.includes(user.role) && !roles.some(role => portalOf(role) === portalOf(user.role))) return <PortalHandoff user={user} />
  if (!roles.includes(user.role)) return <Page title="Access restricted" description="This account cannot access this portal. Sign in with the appropriate account."><SignOut /></Page>
  return children
}
