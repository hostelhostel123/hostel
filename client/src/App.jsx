import { Suspense, lazy, useEffect, useState } from 'react'
import { Link, NavLink, Route, Routes, useLocation } from 'react-router-dom'
import { ArrowRight, ArrowUpRight, Building2, Menu, Search, X } from 'lucide-react'
import { AuthProvider, RequireRole, SignOut, portals, useAuth } from './context/AuthContext'
import { Account, Profile } from './pages/Account'
import { HostelDetail, Hostels } from './pages/Student'
import Messages from './pages/Messages'
import { Page } from './components/ui'
import { ThemeToggle } from './components/theme'

const HeroScene = lazy(() => import('./components/HeroScene'))
const ownerPortal = portals.owner.url
const ownerSignUp = `${ownerPortal}/register`

function Mark() {
  return <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true"><path d="M2 16V6.5L9 2l7 4.5V16" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" /><path d="M6.5 16v-5h5v5M2 16h14" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" /></svg>
}
function Logo() { return <Link to="/" className="flex items-center gap-2.5"><span className="grid h-9 w-9 place-items-center rounded-lg bg-accent text-on-accent"><Mark /></span><span className="text-[16px] font-semibold tracking-tight">hostel<span className="text-accent-ink">hub</span></span></Link> }

function Shell({ children }) {
  const { user, loading } = useAuth()
  const [open, setOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  const location = useLocation()
  useEffect(() => { const update = () => setScrolled(window.scrollY > 8); update(); window.addEventListener('scroll', update, { passive: true }); return () => window.removeEventListener('scroll', update) }, [])
  useEffect(() => { setOpen(false) }, [location.pathname])
  const links = [['/hostels', 'Find a hostel'], ...(user?.role === 'STUDENT' ? [['/favorites', 'Saved']] : []), ...(!user || user.role === 'STUDENT' ? [['/messages', 'Messages']] : []), ...(user ? [['/profile', user.name]] : [['/login', 'Sign in']])]
  const linkClass = ({ isActive }) => `rounded-lg px-3 py-2 text-sm font-medium transition-colors ${isActive ? 'text-ink' : 'text-muted hover:text-ink'}`
  const listProperty = !user && <a href={ownerSignUp} className="rounded-lg px-3 py-2 text-sm font-medium text-muted transition-colors hover:text-ink">List your property</a>
  const navigation = <>{links.map(([to, label]) => <NavLink key={to} to={to} className={linkClass}>{label}</NavLink>)}{listProperty}{user && <SignOut />}</>
  return <div className="flex min-h-screen flex-col">
    <a href="#content" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[60] focus:rounded-lg focus:bg-surface focus:px-4 focus:py-2">Skip to content</a>
    <header className={`sticky top-0 z-40 border-b bg-ground/85 backdrop-blur-xl transition-colors ${scrolled ? 'border-line' : 'border-transparent'}`}>
      <div className="mx-auto flex min-h-[68px] max-w-[1240px] items-center justify-between gap-4 px-5 lg:px-8"><Logo /><div className="flex items-center gap-2"><nav aria-label="Main" className="hidden items-center gap-1 md:flex">{!loading && navigation}</nav><ThemeToggle /><button aria-label="Open navigation" onClick={() => setOpen(true)} className="grid h-11 w-11 place-items-center rounded-lg border border-line bg-surface md:hidden"><Menu size={18} /></button></div></div>
    </header>
    <div id="content" className="flex-1">{children}</div>
    <footer className="border-t border-line">
      <div className="mx-auto grid max-w-[1240px] gap-8 px-5 py-12 text-sm text-muted sm:grid-cols-[1.4fr_1fr_1fr] lg:px-8">
        <div><Logo /><p className="mt-4 max-w-xs leading-6">Approved student housing, shown room by room.</p></div>
        <div><p className="font-medium text-ink">Students</p><ul className="mt-3 grid gap-2"><li><Link className="hover:text-ink" to="/hostels">Find a hostel</Link></li><li><Link className="hover:text-ink" to="/register">Create an account</Link></li></ul></div>
        <div><p className="font-medium text-ink">Owners</p><ul className="mt-3 grid gap-2"><li><a className="hover:text-ink" href={ownerSignUp}>List your property</a></li><li><a className="hover:text-ink" href={`${ownerPortal}/login`}>Owner sign in</a></li></ul></div>
      </div>
    </footer>
    {open && <div className="fade fixed inset-0 z-50 bg-ink/30 backdrop-blur-sm md:hidden"><button aria-label="Close navigation" className="absolute inset-0" onClick={() => setOpen(false)} /><aside className="absolute inset-y-0 right-0 flex w-[300px] flex-col bg-surface p-5"><div className="flex items-center justify-between"><Logo /><button aria-label="Close navigation" className="grid h-11 w-11 place-items-center" onClick={() => setOpen(false)}><X size={18} /></button></div><nav aria-label="Mobile" className="mt-10 grid gap-2">{navigation}{user && <a className="px-3 py-2 text-sm font-medium text-muted" href={ownerPortal}>Owner portal</a>}</nav></aside></div>}
  </div>
}

function Choice({ icon: Icon, title, text, cta, primary, ...link }) {
  const Tag = link.to ? Link : 'a'
  return <Tag {...link} className={`lift group flex flex-col justify-between gap-8 rounded-2xl border p-6 ${primary ? 'border-transparent bg-accent text-on-accent' : 'border-line bg-surface'}`}>
    <div><span className={`grid h-11 w-11 place-items-center rounded-xl ${primary ? 'bg-on-accent/15' : 'bg-accent-soft text-accent-ink'}`}><Icon size={19} aria-hidden="true" /></span><h2 className="mt-6 text-xl font-semibold tracking-tight">{title}</h2><p className={`mt-2 text-[15px] leading-6 ${primary ? 'text-on-accent/80' : 'text-muted'}`}>{text}</p></div>
    <span className="inline-flex items-center gap-2 text-sm font-semibold">{cta}{link.to ? <ArrowRight size={16} aria-hidden="true" className="transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none" /> : <ArrowUpRight size={16} aria-hidden="true" className="transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 motion-reduce:transition-none" />}</span>
  </Tag>
}

function Landing() {
  const steps = {
    'For students': [['Search', 'Filter approved hostels by city, budget and who they house.'], ['Compare rooms', 'See every room type, how many seats are free and the price per seat.'], ['Pick on the plan', 'Open the floor plan, choose your room and send the owner a request.']],
    'For owners': [['Create an account', 'Sign up in the owner portal in under a minute.'], ['Add your hostel', 'Upload photos, set prices and describe your rooms.'], ['Get approved', 'Our team reviews the listing, then students can find it.']],
  }
  return <div>
    <section className="mx-auto grid max-w-[1240px] gap-12 px-5 pb-16 pt-12 lg:grid-cols-[1.05fr_1fr] lg:items-center lg:px-8 lg:pb-24 lg:pt-16">
      <div className="rise">
        <p className="eyebrow">Student housing, room by room</p>
        <h1 className="display mt-5 text-[44px] leading-[1.02] sm:text-[56px] lg:text-[64px]">Find your room.<br /><span className="text-accent-ink">Or fill yours.</span></h1>
        <p className="mt-6 max-w-[500px] text-[17px] leading-8 text-muted">HostelHub shows students every approved hostel down to the room, and gives owners a simple way to list theirs. Which brings you here?</p>
        <div className="mt-9 grid gap-4 sm:grid-cols-2">
          <Choice primary to="/hostels" icon={Search} title="I'm looking for a place" text="Browse approved hostels and choose a room on the floor plan." cta="View listings" />
          <Choice href={ownerSignUp} icon={Building2} title="I own a hostel" text="Create an owner account and list your property for students." cta="List your property" />
        </div>
      </div>
      <div className="relative h-[360px] overflow-hidden rounded-[24px] border border-line sm:h-[460px] lg:h-[580px]" style={{ background: 'radial-gradient(ellipse at 50% 35%, var(--scene-glow-a) 0%, var(--scene-glow-b) 75%)' }}>
        <Suspense fallback={null}><HeroScene /></Suspense>
        <div className="pointer-events-none absolute bottom-5 left-5 flex items-center gap-2 rounded-full border border-line bg-surface/90 px-3.5 py-2 text-xs font-medium text-ink-soft backdrop-blur"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: 'var(--scene-open)' }} />Rooms with free seats</div>
      </div>
    </section>
    <section className="border-y border-line bg-surface">
      <div className="mx-auto max-w-[1240px] px-5 py-20 lg:px-8">
        <div className="max-w-xl"><p className="eyebrow">How it works</p><h2 className="section-title mt-3">Simple on both sides of the door.</h2></div>
        <div className="mt-12 grid gap-10 lg:grid-cols-2">
          {Object.entries(steps).map(([group, items]) => <div key={group}><h3 className="text-sm font-semibold uppercase tracking-[.14em] text-faint">{group}</h3><ol className="mt-5 grid gap-px overflow-hidden rounded-2xl border border-line bg-line">{items.map(([title, text], index) => <li key={title} className="flex gap-5 bg-surface p-6"><span className="display text-3xl leading-none text-accent-ink">{index + 1}</span><div><p className="font-semibold tracking-tight">{title}</p><p className="mt-1 text-[15px] leading-6 text-muted">{text}</p></div></li>)}</ol></div>)}
        </div>
      </div>
    </section>
  </div>
}

export default function App() {
  return <AuthProvider><Shell><Routes><Route path="/" element={<Landing />} /><Route path="/login" element={<Account />} /><Route path="/register" element={<Account key="register" />} /><Route path="/hostels" element={<Hostels />} /><Route path="/hostels/:id" element={<HostelDetail />} /><Route path="/favorites" element={<RequireRole roles={['STUDENT']}><Hostels key="favorites" favorites /></RequireRole>} /><Route path="/messages" element={<RequireRole roles={['STUDENT']}><Messages /></RequireRole>} /><Route path="/profile" element={<RequireRole roles={['STUDENT', 'OWNER']}><Profile /></RequireRole>} /><Route path="/admin/*" element={<Page eyebrow="Administration" title="Administration has moved" description="Admins now manage HostelHub from the owner portal."><a href={`${ownerPortal}/login`} className="action-link">Open the owner portal <ArrowRight size={16} /></a></Page>} /><Route path="/owner/*" element={<Page eyebrow="Property management" title="Owner workspace" description="Manage your listings and student conversations in the dedicated owner portal."><a href={ownerPortal} className="action-link">Open owner portal <ArrowRight size={16} /></a></Page>} /><Route path="*" element={<Page eyebrow="Error 404" title="Page not found" description="The page you were looking for doesn't exist or has moved."><Link to="/" className="action-link">Back home</Link></Page>} /></Routes></Shell></AuthProvider>
}
