import { useState } from 'react'
import { NavLink, Route, Routes } from 'react-router-dom'
import { api } from '../services/api'
import { Button, Cover, Deferred, Empty, ErrorNotice, Field, Loading, Notice, Page, Pagination, Status, useResource } from '../components/ui'

function Analytics() {
  const state = useResource('/admin/analytics')
  const data = state.result?.data
  return <Page eyebrow="Platform overview" title="Administration."><ErrorNotice retry={state.reload}>{state.error}</ErrorNotice>{state.loading && <Loading />}{data && <><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{[['Users', data.users.reduce((sum, group) => sum + group.count, 0)], ['Listings', data.hostels.reduce((sum, group) => sum + group.count, 0)], ['Conversations', data.conversations], ['Messages', data.messages]].map(([label, value]) => <div key={label} className="panel"><p className="text-xs text-muted">{label}</p><p className="mt-4 font-mono text-3xl font-semibold tracking-tight">{value}</p></div>)}</div><div className="mt-5 grid gap-5 md:grid-cols-2"><section className="panel"><h2 className="mb-4 text-sm font-semibold">Users by role</h2>{data.users.map(group => <p key={group._id} className="my-3 flex justify-between text-sm text-muted"><span>{group._id}</span>{group.count}</p>)}</section><section className="panel"><h2 className="mb-4 text-sm font-semibold">Listing status</h2>{data.hostels.map(group => <p key={group._id} className="my-3 flex justify-between text-sm text-muted"><span>{group._id}</span>{group.count}</p>)}</section></div></>}</Page>
}
function ReviewCard({ hostel, reload }) {
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const actions = { PENDING: ['approve', 'reject'], APPROVED: ['suspend'], SUSPENDED: ['restore'] }[hostel.status] || []
  async function act(action) { setBusy(true); setError(''); try { await api(`/admin/hostels/${hostel._id}/${action}`, { method: 'PATCH', body: { reason } }); reload() } catch (cause) { setError(cause.message) } finally { setBusy(false) } }
  return <article className="panel grid gap-5 lg:grid-cols-[240px_1fr]"><div><Cover hostel={hostel} /><div className="mt-3 flex flex-wrap gap-2">{hostel.images.map(image => <a key={image.publicId} href={image.url} target="_blank" rel="noreferrer"><img src={image.url} alt={`${hostel.name} photo`} className="h-14 w-14 rounded object-cover" /></a>)}</div></div><div><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="font-semibold">{hostel.name}</h2><Status value={hostel.status} /></div><p className="mt-2 text-xs text-muted">{hostel.owner?.name} · {hostel.owner?.email}</p><p className="mt-3 text-sm text-muted">{hostel.address}, {hostel.city} · PKR {hostel.price.toLocaleString()} · {hostel.beds} beds · {hostel.gender}</p><p className="my-3 whitespace-pre-wrap text-sm leading-6 text-muted">{hostel.description}</p><p className="text-xs text-muted">{hostel.amenities.join(' · ')}</p>{hostel.moderationReason && <p className="my-3 text-sm text-limited">Last review: {hostel.moderationReason}</p>}{actions.length > 0 && <><Field label="Review note (optional)"><input className="input mt-3" maxLength={1000} value={reason} onChange={event => setReason(event.target.value)} /></Field><div className="mt-4 flex flex-wrap gap-3">{actions.map(action => <Button key={action} disabled={busy} secondary={action !== 'approve'} onClick={() => act(action)}>{action[0].toUpperCase() + action.slice(1)}</Button>)}</div></>}<ErrorNotice>{error}</ErrorNotice></div></article>
}
function Listings() {
  const [status, setStatus] = useState('PENDING')
  const [page, setPage] = useState(1)
  const state = useResource(`/admin/hostels?page=${page}${status ? `&status=${status}` : ''}`)
  return <Page eyebrow="Moderation" title="Manage hostels." action={<select aria-label="Listing status" className="input" value={status} onChange={event => { setStatus(event.target.value); setPage(1) }}><option value="">All statuses</option>{['DRAFT', 'PENDING', 'APPROVED', 'REJECTED', 'SUSPENDED'].map(value => <option key={value}>{value}</option>)}</select>}><ErrorNotice retry={state.reload}>{state.error}</ErrorNotice>{state.loading ? <Loading /> : <div className="space-y-5">{state.result?.data.map(hostel => <ReviewCard key={hostel._id} hostel={hostel} reload={state.reload} />)}{state.result?.data.length === 0 && <Empty>No listings in this queue.</Empty>}<Pagination pagination={state.result?.pagination} onChange={setPage} /></div>}</Page>
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
  return <Page eyebrow="Accounts" title="Manage users."><ErrorNotice retry={state.reload}>{state.error || error}</ErrorNotice><Notice>{notice}</Notice>{state.loading ? <Loading /> : <div className="space-y-3">{state.result?.data.map(user => <div key={user.id} className="panel flex flex-wrap items-center justify-between gap-4"><div><p className="text-sm font-semibold">{user.name}</p><p className="mt-1 text-xs text-muted">{user.email} · {user.role} · {user.active ? 'Active' : 'Suspended'}</p></div>{user.role !== 'ADMIN' && <Button secondary disabled={Boolean(busy)} onClick={() => toggle(user)}>{user.active ? 'Suspend account' : 'Restore account'}</Button>}</div>)}{state.result?.data.length === 0 && <Empty>No users found.</Empty>}<Pagination pagination={state.result?.pagination} onChange={setPage} /></div>}</Page>
}
export default function Admin() {
  return <><nav aria-label="Administration" className="mx-auto flex max-w-[1240px] flex-wrap gap-2 px-5 pt-6 lg:px-8">{[['/admin', 'Overview'], ['/admin/hostels', 'Hostels'], ['/admin/users', 'Users'], ['/admin/analytics', 'Analytics'], ['/admin/reports', 'Reports'], ['/admin/subscriptions', 'Subscriptions']].map(([to, label]) => <NavLink end key={to} to={to} className={({ isActive }) => `rounded-lg px-4 py-2.5 text-sm font-medium transition-colors ${isActive ? 'bg-ink text-white' : 'border border-line bg-surface text-muted hover:text-ink'}`}>{label}</NavLink>)}</nav><Routes><Route index element={<Analytics />} /><Route path="analytics" element={<Analytics />} /><Route path="hostels" element={<Listings />} /><Route path="users" element={<Users />} /><Route path="reports" element={<Deferred title="Reports" />} /><Route path="subscriptions" element={<Deferred title="Subscriptions" />} /><Route path="*" element={<Page title="Page not found" />} /></Routes></>
}
