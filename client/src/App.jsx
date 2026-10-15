import { Suspense, lazy, useEffect, useState } from 'react'
import { Link, NavLink, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { ArrowRight, LayoutGrid, Menu, MessageCircle, Search, X } from 'lucide-react'
import { AuthProvider, RequireRole, SignOut, useAuth } from './context/AuthContext'
import { Account, Profile } from './pages/Account'
import { HostelDetail, Hostels } from './pages/Student'
import Admin from './pages/Admin'
import Messages from './pages/Messages'
import { Page } from './components/ui'

const HeroScene = lazy(() => import('./components/HeroScene'))
const ownerPortal = import.meta.env.VITE_OWNER_PORTAL_URL || 'https://hostel-site-admin.vercel.app'

function Mark() {
  return <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true"><path d="M2 16V6.5L9 2l7 4.5V16" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" /><path d="M6.5 16v-5h5v5M2 16h14" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" /></svg>
}
function Logo() { return <Link to="/" className="flex items-center gap-2.5"><span className="grid h-9 w-9 place-items-center rounded-lg bg-ink text-white"><Mark /></span><span className="text-[16px] font-semibold tracking-tight">hostel<span className="text-accent">hub</span></span></Link> }

function Shell({ children }) {
  const { user, loading } = useAuth()
  const [open, setOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  const location = useLocation()
  useEffect(() => { const update = () => setScrolled(window.scrollY > 8); update(); window.addEventListener('scroll', update, { passive: true }); return () => window.removeEventListener('scroll', update) }, [])
  useEffect(() => { setOpen(false) }, [location.pathname])
  const links = [['/hostels', 'Find a hostel'], ...(user?.role === 'STUDENT' ? [['/favorites', 'Saved'], ['/messages', 'Messages']] : []), ...(user?.role === 'ADMIN' ? [['/admin', 'Administration']] : []), ...(user ? [['/profile', user.name]] : [['/login', 'Sign in']])]
  const linkClass = ({ isActive }) => `rounded-lg px-3 py-2 text-sm font-medium transition-colors ${isActive ? 'text-ink' : 'text-muted hover:text-ink'}`
  const navigation = <>{links.map(([to, label]) => <NavLink key={to} to={to} onClick={() => setOpen(false)} className={linkClass}>{label}</NavLink>)}{user && <SignOut />}</>
  return <div className="flex min-h-screen flex-col">
    <header className={`sticky top-0 z-40 border-b bg-ground/85 backdrop-blur-xl transition-colors ${scrolled ? 'border-line' : 'border-transparent'}`}>
      <div className="mx-auto flex min-h-[68px] max-w-[1240px] items-center justify-between gap-4 px-5 lg:px-8"><Logo /><nav aria-label="Main" className="hidden items-center gap-1 md:flex">{!loading && navigation}</nav><button aria-label="Open navigation" onClick={() => setOpen(true)} className="grid h-11 w-11 place-items-center rounded-lg border border-line bg-surface md:hidden"><Menu size={18} /></button></div>
    </header>
    <div className="flex-1">{children}</div>
    <footer className="border-t border-line">
      <div className="mx-auto flex max-w-[1240px] flex-wrap items-center justify-between gap-4 px-5 py-8 text-sm text-muted lg:px-8"><Logo /><p>Approved student housing, room by room.</p><a className="font-medium text-ink hover:text-accent" href={ownerPortal}>Own a hostel? List it</a></div>
    </footer>
    {open && <div className="fade fixed inset-0 z-50 bg-ink/25 backdrop-blur-sm md:hidden"><button aria-label="Close navigation" className="absolute inset-0" onClick={() => setOpen(false)} /><aside className="absolute inset-y-0 right-0 flex w-[300px] flex-col bg-surface p-5"><div className="flex items-center justify-between"><Logo /><button aria-label="Close navigation" className="grid h-11 w-11 place-items-center" onClick={() => setOpen(false)}><X size={18} /></button></div><nav aria-label="Mobile" className="mt-10 grid gap-2">{navigation}<a className="px-3 py-2 text-sm font-medium" href={ownerPortal}>Owner portal</a></nav></aside></div>}
  </div>
}

function HeroSearch() {
  const navigate = useNavigate()
  const [q, setQ] = useState('')
  const [city, setCity] = useState('')
  function submit(event) {
    event.preventDefault()
    const params = new URLSearchParams()
    if (q.trim()) params.set('q', q.trim())
    if (city.trim()) params.set('city', city.trim())
    navigate(`/hostels${params.size ? `?${params}` : ''}`)
  }
  return <form onSubmit={submit} role="search" className="mt-9 grid max-w-[560px] gap-2 rounded-2xl border border-line bg-surface p-2 shadow-[0_20px_50px_-30px_rgba(18,20,23,.35)] sm:grid-cols-[minmax(0,1fr)_minmax(0,.8fr)_auto]">
    <label className="flex min-w-0 flex-col px-3 py-1.5"><span className="text-[11px] font-medium text-muted">Hostel or area</span><input className="h-7 w-full min-w-0 bg-transparent text-[15px] outline-none placeholder:text-faint" placeholder="e.g. Gulberg" value={q} onChange={event => setQ(event.target.value)} maxLength={100} /></label>
    <label className="flex min-w-0 flex-col border-line px-3 py-1.5 sm:border-l"><span className="text-[11px] font-medium text-muted">City</span><input className="h-7 w-full min-w-0 bg-transparent text-[15px] outline-none placeholder:text-faint" placeholder="Any city" value={city} onChange={event => setCity(event.target.value)} maxLength={100} /></label>
    <button className="btn btn-accent h-full min-h-12 px-5"><Search size={16} aria-hidden="true" />Search</button>
  </form>
}

function Landing() {
  return <div>
    <section className="mx-auto grid max-w-[1240px] gap-10 px-5 pb-16 pt-12 lg:grid-cols-[1fr_1.05fr] lg:items-center lg:px-8 lg:pb-24 lg:pt-20">
      <div className="rise">
        <p className="eyebrow">Student housing, room by room</p>
        <h1 className="mt-5 text-[44px] font-semibold leading-[1.02] tracking-[-.04em] sm:text-[56px] lg:text-[60px]">See the floor plan.<br /><span className="text-muted">Choose your room.</span></h1>
        <p className="mt-6 max-w-[480px] text-[17px] leading-8 text-muted">Compare approved hostels by the rooms they actually have free: how many seats, what each costs and where it sits on the floor.</p>
        <HeroSearch />
      </div>
      <div className="relative h-[360px] overflow-hidden rounded-[22px] border border-line bg-[radial-gradient(ellipse_at_50%_35%,#ffffff_0%,#efede6_70%)] sm:h-[460px] lg:h-[540px]">
        <Suspense fallback={null}><HeroScene /></Suspense>
        <div className="pointer-events-none absolute bottom-5 left-5 flex items-center gap-2 rounded-full border border-line bg-surface/90 px-3.5 py-2 text-xs font-medium text-ink-soft backdrop-blur"><span className="h-2.5 w-2.5 rounded-sm bg-accent" />Rooms with free seats</div>
      </div>
    </section>
    <section className="border-y border-line bg-surface">
      <div className="mx-auto max-w-[1240px] px-5 py-20 lg:px-8">
        <div className="max-w-xl"><p className="eyebrow">How it works</p><h2 className="section-title mt-3">From search to your own room in three steps.</h2></div>
        <ol className="mt-12 grid gap-px overflow-hidden rounded-2xl border border-line bg-line md:grid-cols-3">
          {[[Search, 'Search', 'Filter approved hostels by city, budget and who they house.'], [LayoutGrid, 'Compare rooms', 'Every result lists its room types, free seats and monthly cost up front.'], [MessageCircle, 'Pick on the plan', 'Open the floor plan, choose a room and send the owner your request.']].map(([Icon, title, text], index) => <li key={title} className="bg-surface p-7"><div className="flex items-center justify-between"><span className="grid h-11 w-11 place-items-center rounded-xl bg-accent-soft text-accent"><Icon size={18} aria-hidden="true" /></span><span className="font-mono text-xs text-faint">0{index + 1}</span></div><h3 className="mt-8 text-lg font-semibold tracking-tight">{title}</h3><p className="mt-2 text-[15px] leading-7 text-muted">{text}</p></li>)}
        </ol>
      </div>
    </section>
    <section className="mx-auto max-w-[1240px] px-5 py-20 lg:px-8">
      <div className="flex flex-wrap items-center justify-between gap-8 rounded-[22px] bg-ink px-8 py-12 text-white lg:px-14">
        <div className="max-w-lg"><h2 className="text-3xl font-semibold tracking-tight">Ready to find your place?</h2><p className="mt-3 text-[15px] leading-7 text-white/65">Browse every approved listing and see which rooms are open right now.</p></div>
        <div className="flex flex-wrap gap-3"><Link to="/hostels" className="btn bg-white text-ink hover:bg-white/90">Explore hostels <ArrowRight size={16} aria-hidden="true" /></Link><a href={ownerPortal} className="btn border border-white/25 text-white hover:bg-white/10">List your property</a></div>
      </div>
    </section>
  </div>
}

export default function App() {
  return <AuthProvider><Shell><Routes><Route path="/" element={<Landing />} /><Route path="/login" element={<Account />} /><Route path="/register" element={<Account key="register" />} /><Route path="/hostels" element={<Hostels />} /><Route path="/hostels/:id" element={<HostelDetail />} /><Route path="/favorites" element={<RequireRole roles={['STUDENT']}><Hostels key="favorites" favorites /></RequireRole>} /><Route path="/messages" element={<RequireRole roles={['STUDENT']}><Messages /></RequireRole>} /><Route path="/profile" element={<RequireRole roles={['STUDENT', 'OWNER', 'ADMIN']}><Profile /></RequireRole>} /><Route path="/admin/*" element={<RequireRole roles={['ADMIN']}><Admin /></RequireRole>} /><Route path="/owner/*" element={<Page eyebrow="Property management" title="Owner workspace" description="Manage your listings and student conversations in the dedicated owner portal."><a href={ownerPortal} className="action-link">Open owner portal <ArrowRight size={16} /></a></Page>} /><Route path="*" element={<Page title="Page not found"><Link to="/" className="action-link">Back home</Link></Page>} /></Routes></Shell></AuthProvider>
}
