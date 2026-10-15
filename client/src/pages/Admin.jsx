import { useState } from 'react'
import { NavLink, Route, Routes } from 'react-router-dom'
import { BarChart3, Building2, CreditCard, FileText, LayoutDashboard, Mail, MapPin, Users as UsersIcon } from 'lucide-react'
import { api } from '../services/api'
import { Button, Cover, Deferred, Empty, ErrorNotice, Field, Loading, Notice, Page, Pagination, StatTile, Status, useResource } from '../components/ui'

const sum = groups => groups.reduce((total, group) => total + group.count, 0)
const statusTone = { APPROVED: 'var(--color-open)', PENDING: 'var(--color-limited)', REJECTED: 'var(--color-danger)', SUSPENDED: 'var(--color-danger)', DRAFT: 'var(--color-full)' }

function Breakdown({ title, groups, tone = {} }) {
  const total = Math.max(sum(groups), 1)
  return <section className="panel"><h2 className="text-sm font-semibold">{title}</h2>
    {groups.length ? <ul className="mt-5 grid gap-4">{groups.map(group => <li key={group._id}><div className="flex justify-between gap-3 text-sm"><span className="text-muted">{group._id}</span><span className="font-mono font-medium">{group.count}</span></div><div className="mt-2 h-2 overflow-hidden rounded-full bg-raised"><div className="h-full rounded-full" style={{ width: `${(group.count / total) * 100}%`, background: tone[group._id] || 'var(--color-accent)' }} /></div></li>)}</ul> : <p className="mt-4 text-sm text-muted">No data yet.</p>}
  </section>
}
function Analytics() {
  const state = useResource('/admin/analytics')
  const data = state.result?.data
  return <Page eyebrow="Platform overview" title="Administration." description="Live counts from the database across users, listings and conversations."><ErrorNotice retry={state.reload}>{state.error}</ErrorNotice>{state.loading && <Loading />}{data && <><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"><StatTile label="Users" value={sum(data.users)} /><StatTile label="Listings" value={sum(data.hostels)} hint={`${data.hostels.find(group => group._id === 'PENDING')?.count || 0} awaiting review`} /><StatTile label="Conversations" value={data.conversations} /><StatTile label="Messages" value={data.messages} /></div><div className="mt-5 grid gap-5 md:grid-cols-2"><Breakdown title="Users by role" groups={data.users} /><Breakdown title="Listing status" groups={data.hostels} tone={statusTone} /></div></>}</Page>
}
function ReviewCard({ hostel, reload }) {
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const actions = { PENDING: ['approve', 'reject'], APPROVED: ['suspend'], SUSPENDED: ['restore'] }[hostel.status] || []
  async function act(action) { setBusy(true); setError(''); try { await api(`/admin/hostels/${hostel._id}/${action}`, { method: 'PATCH', body: { reason } }); reload() } catch (cause) { setError(cause.message) } finally { setBusy(false) } }
  return <article className="panel rise grid gap-6 lg:grid-cols-[280px_1fr]">
    <div><Cover hostel={hostel} className="h-48 w-full" />{hostel.images.length > 1 && <div className="mt-3 flex flex-wrap gap-2">{hostel.images.slice(1).map(image => <a key={image.publicId} href={image.url} target="_blank" rel="noreferrer"><img src={image.url} alt={`${hostel.name} photo`} className="h-14 w-14 rounded-lg object-cover" /></a>)}</div>}</div>
    <div className="min-w-0">
      <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-xl font-semibold tracking-tight">{hostel.name}</h2><p className="mt-1.5 flex items-center gap-1.5 text-sm text-muted"><MapPin size={14} aria-hidden="true" />{hostel.address}, {hostel.city}</p></div><Status value={hostel.status} /></div>
      <dl className="mt-5 grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-line bg-line sm:grid-cols-4">{[['Price', `PKR ${hostel.price.toLocaleString()}`], ['Beds', hostel.beds], ['Residents', hostel.gender], ['Rooms on plan', hostel.rooms?.length || '—']].map(([label, value]) => <div key={label} className="bg-surface p-3"><dt className="text-xs text-faint">{label}</dt><dd className="mt-1 text-sm font-medium">{value}</dd></div>)}</dl>
      <p className="mt-5 whitespace-pre-wrap text-sm leading-6 text-muted">{hostel.description}</p>
      {hostel.amenities.length > 0 && <ul className="mt-4 flex flex-wrap gap-2">{hostel.amenities.map(item => <li key={item} className="chip">{item}</li>)}</ul>}
      <p className="mt-4 flex items-center gap-1.5 text-xs text-faint"><Mail size={13} aria-hidden="true" />{hostel.owner?.name} · {hostel.owner?.email}</p>
      {hostel.moderationReason && <p className="mt-3 text-sm text-limited">Last review: {hostel.moderationReason}</p>}
      {actions.length > 0 && <div className="mt-6 border-t border-line pt-5"><Field label="Review note (optional)"><input className="input" maxLength={1000} value={reason} onChange={event => setReason(event.target.value)} placeholder="Shared with the owner" /></Field><div className="mt-4 flex flex-wrap gap-3">{actions.map(action => <button key={action} disabled={busy} className={`btn ${action === 'approve' ? 'btn-accent' : 'btn-secondary'}`} onClick={() => act(action)}>{action[0].toUpperCase() + action.slice(1)}</button>)}</div></div>}
      <ErrorNotice>{error}</ErrorNotice>
    </div>
  </article>
}
const statuses = [['PENDING', 'Pending'], ['APPROVED', 'Approved'], ['REJECTED', 'Rejected'], ['SUSPENDED', 'Suspended'], ['DRAFT', 'Drafts'], ['', 'All']]
function Listings() {
  const [status, setStatus] = useState('PENDING')
  const [page, setPage] = useState(1)
  const state = useResource(`/admin/hostels?page=${page}${status ? `&status=${status}` : ''}`)
  return <Page eyebrow="Moderation" title="Manage hostels." description="Review submissions before students can see them.">
    <div role="group" aria-label="Listing status" className="mb-6 flex flex-wrap gap-2">{statuses.map(([value, label]) => <button key={label} type="button" aria-pressed={status === value} onClick={() => { setStatus(value); setPage(1) }} className={`btn min-h-10 px-4 ${status === value ? 'btn-primary' : 'btn-secondary'}`}>{label}</button>)}</div>
    <ErrorNotice retry={state.reload}>{state.error}</ErrorNotice>{state.loading ? <Loading /> : <div className="space-y-5">{state.result?.data.map(hostel => <ReviewCard key={hostel._id} hostel={hostel} reload={state.reload} />)}{state.result?.data.length === 0 && <Empty>No listings in this queue.</Empty>}<Pagination pagination={state.result?.pagination} onChange={setPage} /></div>}
  </Page>
}
function Users() {
  const [page, setPage] = useState(1)
  const state = useResource(`/admin/users?page=${page}`)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState('')
  async function toggle(user) {
    setBusy(user.id); setError(''); setNotice('')
    try { await api(`/admin/users/${user.id}`, { method: 'PATCH', body: { active: !user.active } }); setNotice(user.active ? 'Account suspended. Existing sessions have been revoked.' : 'Account restored. Listings remain subject to review.'); state.reload() }
    catch (cause) { setError(cause.message) } finally { setBusy('') }
  }
  return <Page eyebrow="Accounts" title="Manage users." description="Suspending an account signs it out everywhere."><ErrorNotice retry={state.reload}>{state.error || error}</ErrorNotice><Notice>{notice}</Notice>{state.loading ? <Loading /> : <>
    {state.result?.data.length > 0 && <div className="overflow-x-auto rounded-2xl border border-line bg-surface"><table className="w-full min-w-[640px] text-sm"><thead><tr className="border-b border-line text-left text-xs text-faint"><th scope="col" className="px-5 py-3 font-medium">Name</th><th scope="col" className="px-5 py-3 font-medium">Email</th><th scope="col" className="px-5 py-3 font-medium">Role</th><th scope="col" className="px-5 py-3 font-medium">Status</th><th scope="col" className="px-5 py-3"><span className="sr-only">Action</span></th></tr></thead>
      <tbody>{state.result.data.map(user => <tr key={user.id} className="border-b border-line last:border-0"><td className="px-5 py-3.5 font-medium">{user.name}</td><td className="px-5 py-3.5 text-muted">{user.email}</td><td className="px-5 py-3.5"><span className="chip font-mono !text-[11px]">{user.role}</span></td><td className="px-5 py-3.5"><span className={`inline-flex items-center gap-1.5 text-sm ${user.active ? 'text-open' : 'text-danger'}`}><span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-current" />{user.active ? 'Active' : 'Suspended'}</span></td><td className="px-5 py-3.5 text-right">{user.role !== 'ADMIN' && <Button secondary disabled={Boolean(busy)} onClick={() => toggle(user)}>{user.active ? 'Suspend account' : 'Restore account'}</Button>}</td></tr>)}</tbody></table></div>}
    {state.result?.data.length === 0 && <Empty>No users found.</Empty>}<Pagination pagination={state.result?.pagination} onChange={setPage} /></>}</Page>
}
const sections = [['/admin', 'Overview', LayoutDashboard], ['/admin/hostels', 'Hostels', Building2], ['/admin/users', 'Users', UsersIcon], ['/admin/analytics', 'Analytics', BarChart3], ['/admin/reports', 'Reports', FileText], ['/admin/subscriptions', 'Subscriptions', CreditCard]]
export default function Admin() {
  return <div className="mx-auto flex max-w-[1320px] flex-wrap gap-x-10 px-5 lg:flex-nowrap lg:px-8">
    <nav aria-label="Administration" className="w-full pt-8 lg:w-56 lg:shrink-0 lg:pt-14"><p className="eyebrow mb-4 hidden lg:block">Admin</p><ul className="flex gap-1 overflow-x-auto pb-2 lg:flex-col lg:overflow-visible">{sections.map(([to, label, Icon]) => <li key={to}><NavLink end to={to} className={({ isActive }) => `flex min-h-11 items-center gap-3 whitespace-nowrap rounded-lg px-3 text-sm font-medium transition-colors ${isActive ? 'bg-accent-soft text-accent-ink' : 'text-muted hover:bg-raised hover:text-ink'}`}><Icon size={16} aria-hidden="true" />{label}</NavLink></li>)}</ul></nav>
    <div className="min-w-0 flex-[999_1_560px] [&>main]:px-0"><Routes><Route index element={<Analytics />} /><Route path="analytics" element={<Analytics />} /><Route path="hostels" element={<Listings />} /><Route path="users" element={<Users />} /><Route path="reports" element={<Deferred title="Reports" />} /><Route path="subscriptions" element={<Deferred title="Subscriptions" />} /><Route path="*" element={<Page title="Page not found" />} /></Routes></div>
  </div>
}
