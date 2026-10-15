import { useEffect, useState } from 'react'
import { NavLink, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { Building2, CreditCard, LayoutDashboard, Menu, MessageCircle, UserRound, X } from 'lucide-react'
import { AuthProvider, RequireRole, SignOut, useAuth } from './context/AuthContext'
import { Account, Profile } from './pages/Account'
import { OwnerDashboard, OwnerListings } from './pages/Owner'
import Messages from './pages/Messages'
import Admin, { adminLinks } from './pages/Admin'
import VerifyPhone from './pages/VerifyPhone'
import { Deferred, Page } from './components/ui'
import { ThemeToggle } from './components/theme'

const ownerLinks = [
  ['/dashboard', 'Overview', LayoutDashboard], ['/hostel', 'My hostels', Building2],
  ['/messages', 'Messages', MessageCircle], ['/subscription', 'Subscription', CreditCard], ['/profile', 'Profile', UserRound],
]
function Mark() {
  return <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true"><path d="M2 16V6.5L9 2l7 4.5V16" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" /><path d="M6.5 16v-5h5v5M2 16h14" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" /></svg>
}
const staffRoles = ['ADMIN', 'SUPERADMIN']
function Shell() {
  const [open, setOpen] = useState(false)
  const { user } = useAuth()
  const location = useLocation()
  useEffect(() => { setOpen(false) }, [location.pathname])
  const staff = staffRoles.includes(user.role)
  const home = staff ? '/admin' : '/dashboard'
  const links = staff ? [...adminLinks.filter(([, , , role]) => !role || role === user.role), ['/profile', 'Profile', UserRound]] : ownerLinks
  const title = [...links].sort(([a], [b]) => b.length - a.length).find(([path]) => location.pathname.startsWith(path))?.[1] || (staff ? 'Admin portal' : 'Owner portal')
  const initials = user.name.split(/\s+/).map(part => part[0]).slice(0, 2).join('').toUpperCase()
  return <div className="min-h-screen bg-ground">
    {open && <button aria-label="Close navigation" onClick={() => setOpen(false)} className="fade fixed inset-0 z-40 bg-ink/30 backdrop-blur-sm lg:hidden" />}
    <aside className={`fixed inset-y-0 left-0 z-50 flex w-[264px] flex-col border-r border-line bg-surface p-4 transition-transform duration-300 ease-out lg:translate-x-0 ${open ? 'translate-x-0' : '-translate-x-full'}`}>
      <div className="flex h-14 items-center justify-between px-2"><NavLink to={home} className="flex items-center gap-3"><span className="grid h-9 w-9 place-items-center rounded-lg bg-accent text-on-accent"><Mark /></span><span><span className="block text-[15px] font-semibold leading-none tracking-tight">hostel<span className="text-accent-ink">hub</span></span><span className="mt-1.5 block text-[10px] font-semibold uppercase tracking-[.18em] text-faint">{staff ? 'Admin portal' : 'Owner portal'}</span></span></NavLink><button aria-label="Close navigation" className="grid h-11 w-11 place-items-center lg:hidden" onClick={() => setOpen(false)}><X size={17} /></button></div>
      <div className="mt-6 flex items-center gap-3 rounded-xl border border-line bg-raised p-3"><span aria-hidden="true" className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-accent-soft font-mono text-xs font-semibold text-accent-ink">{initials}</span><div className="min-w-0"><p className="text-[11px] text-faint">Your workspace</p><p className="truncate text-sm font-semibold">{user.name}</p></div></div>
      <nav aria-label={staff ? 'Administration' : 'Owner'} className="mt-6 grid gap-1">{links.map(([to, label, Icon]) => <NavLink key={to} to={to} end={to === '/admin'} className={({ isActive }) => `flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors ${isActive ? 'bg-accent-soft text-accent-ink' : 'text-muted hover:bg-raised hover:text-ink'}`}><Icon size={16} aria-hidden="true" />{label}</NavLink>)}</nav>
      <div className="mt-auto flex items-center justify-between gap-2 border-t border-line pt-4"><SignOut /><ThemeToggle /></div>
    </aside>
    <div className="lg:pl-[264px]">
      <header className="sticky top-0 z-30 flex h-[68px] items-center justify-between gap-3 border-b border-line bg-ground/85 px-5 backdrop-blur-xl lg:px-8"><div className="flex items-center gap-3"><button aria-label="Open navigation" onClick={() => setOpen(true)} className="grid h-11 w-11 place-items-center rounded-lg border border-line bg-surface lg:hidden"><Menu size={18} /></button><div><p className="text-[11px] text-faint">Workspace</p><p className="text-sm font-semibold">{title}</p></div></div><NavLink to="/profile" className="btn btn-secondary">{user.name}</NavLink></header>
      {user.phoneVerificationRequired && location.pathname !== '/verify-phone' && <div role="status" className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-accent-soft px-5 py-3 text-sm text-accent-ink lg:px-8"><span>Verify your mobile number before submitting a listing for review.</span><NavLink to="/verify-phone" className="font-semibold underline">Verify now</NavLink></div>}
      {staff ? <Routes><Route path="/admin/*" element={<Admin />} /><Route path="/profile" element={<Profile key={user.id} />} /><Route path="*" element={<Navigate to="/admin" replace />} /></Routes> : <Routes><Route path="/" element={<Navigate to="/dashboard" replace />} /><Route path="/owner" element={<Navigate to="/dashboard" replace />} /><Route path="/owner/hostel" element={<Navigate to="/hostel" replace />} /><Route path="/owner/messages" element={<Navigate to="/messages" replace />} /><Route path="/owner/profile" element={<Navigate to="/profile" replace />} /><Route path="/owner/subscription" element={<Navigate to="/subscription" replace />} /><Route path="/verify-phone" element={<VerifyPhone />} /><Route path="/dashboard" element={<OwnerDashboard />} /><Route path="/hostel" element={<OwnerListings />} /><Route path="/messages" element={<Messages />} /><Route path="/profile" element={<Profile key={user.id} />} /><Route path="/subscription" element={<Deferred title="Subscriptions" />} /><Route path="*" element={<Page eyebrow="Error 404" title="Page not found"><NavLink to="/dashboard" className="action-link">Back to overview</NavLink></Page>} /></Routes>}
    </div>
  </div>
}
function AuthFrame({ children }) {
  return <div className="min-h-screen bg-ground"><div className="fixed right-4 top-4 z-10"><ThemeToggle /></div>{children}</div>
}
export default function App() {
  return <AuthProvider><Routes><Route path="/login" element={<AuthFrame><Account role="OWNER" /></AuthFrame>} /><Route path="/register" element={<AuthFrame><Account key="register" role="OWNER" /></AuthFrame>} /><Route path="*" element={<RequireRole roles={['OWNER', ...staffRoles]}><Shell /></RequireRole>} /></Routes></AuthProvider>
}
