import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { api } from '../services/api'
import { ArrowRight, ImagePlus, MapPin, MessageCircle, Plus, Trash2 } from 'lucide-react'
import { Button, Cover, Empty, ErrorNotice, Field, Loading, Notice, Page, Pagination, StatTile, Status, useResource } from '../components/ui'

export function OwnerDashboard() {
  const { user } = useAuth()
  const { result, loading, error, reload } = useResource('/owner/summary')
  const data = result?.data
  return <Page eyebrow="Owner workspace" title={`Welcome, ${user.firstName || user.name}.`} description="Your listings and student conversations at a glance." action={<Link className="action-link" to="/hostel">Manage listings</Link>}><ErrorNotice retry={reload}>{error}</ErrorNotice>{loading && <Loading />}{data && <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><StatTile label="Listings" value={data.hostels.reduce((sum, item) => sum + item.count, 0)} /><StatTile label="Approved" value={data.hostels.find(item => item._id === 'APPROVED')?.count || 0} hint="Visible to students" /><StatTile label="Conversations" value={data.conversations} /><StatTile label="Unread messages" value={data.unreadMessages} /></div>}
    <div className="mt-6 grid gap-4 md:grid-cols-2">{[['/hostel', Plus, 'Create, edit and submit your listings', 'Add photos and details, then send a listing for review.'], ['/messages', MessageCircle, 'Read and reply to students', 'Answer room requests and questions in one inbox.']].map(([to, Icon, title, text]) => <Link key={to} to={to} className="lift panel group flex items-start gap-4"><span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent-ink"><Icon size={18} aria-hidden="true" /></span><span className="min-w-0 flex-1"><span className="flex items-center justify-between gap-3 font-semibold">{title}<ArrowRight size={16} aria-hidden="true" className="text-faint transition-transform group-hover:translate-x-0.5" /></span><span className="mt-1 block text-sm text-muted">{text}</span></span></Link>)}</div></Page>
}
const blank = { name: '', description: '', city: '', address: '', price: '', beds: '', gender: 'ANY', amenities: '' }
function listingForm(hostel) { return hostel ? { ...Object.fromEntries(Object.keys(blank).map(key => [key, hostel[key] ?? blank[key]])), amenities: hostel.amenities.join(', ') } : { ...blank } }
export function OwnerListings() {
  const [page, setPage] = useState(1)
  const list = useResource(`/owner/hostels?page=${page}`)
  const [editing, setEditing] = useState(undefined)
  const [generation, setGeneration] = useState(0)
  return <Page eyebrow="Property management" title="Your hostels." description="Save a draft, upload photos, then submit it for review." action={<button className="btn btn-accent" onClick={() => { setEditing(null); setGeneration(value => value + 1) }}><Plus size={16} aria-hidden="true" />Create listing</button>}><ErrorNotice retry={list.reload}>{list.error}</ErrorNotice>{editing !== undefined ? <ListingEditor key={generation} initial={editing} onClose={() => { setEditing(undefined); list.reload() }} onSaved={list.reload} /> : list.loading ? <Loading /> : <><div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">{list.result?.data.map(hostel => <article key={hostel._id} className="lift rise flex flex-col overflow-hidden rounded-2xl border border-line bg-surface"><div className="p-2"><Cover hostel={hostel} className="h-48 w-full" /></div><div className="flex flex-1 flex-col p-5 pt-3"><div className="flex flex-wrap items-start justify-between gap-3"><h2 className="text-lg font-semibold tracking-tight">{hostel.name}</h2><Status value={hostel.status} /></div><p className="mt-1.5 flex items-center gap-1.5 text-sm text-muted"><MapPin size={14} aria-hidden="true" />{hostel.city}</p><p className="mt-3 text-sm"><span className="font-semibold">PKR {hostel.price.toLocaleString()}</span><span className="text-muted"> / month · {hostel.beds} beds</span></p>{hostel.moderationReason && <p className="mt-3 rounded-lg bg-raised px-3 py-2 text-sm text-limited">Review note: {hostel.moderationReason}</p>}<div className="mt-auto pt-5"><Button secondary className="w-full" onClick={() => { setEditing(hostel); setGeneration(value => value + 1) }}>Manage listing</Button></div></div></article>)}</div>{list.result?.data.length === 0 && <Empty>You have no listings. Create your first hostel to get started.</Empty>}<Pagination pagination={list.result?.pagination} onChange={setPage} /></>}</Page>
}
function ListingEditor({ initial, onClose, onSaved }) {
  const [hostel, setHostel] = useState(initial)
  const [form, setForm] = useState(() => listingForm(initial))
  const [dirty, setDirty] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const suspended = hostel?.status === 'SUSPENDED'
  const update = key => event => { setForm(current => ({ ...current, [key]: event.target.value })); setDirty(true); setNotice('') }
  async function perform(action, message) {
    setBusy(true); setError(''); setNotice('')
    try { const result = await action(); if (result?.data) setHostel(result.data); setNotice(message); onSaved(); return result }
    catch (cause) { setError(cause.message); return null } finally { setBusy(false) }
  }
  async function save(event) {
    event.preventDefault()
    const result = await perform(() => api(hostel ? `/hostels/${hostel._id}` : '/hostels', { method: hostel ? 'PUT' : 'POST', body: { ...form, price: Number(form.price), beds: Number(form.beds), amenities: form.amenities.split(',').map(value => value.trim()).filter(Boolean) } }), 'Draft saved. Submit it when your details and photos are ready.')
    if (result) setDirty(false)
  }
  async function upload(event) {
    const files = Array.from(event.target.files || []); event.target.value = ''
    if (!files.length) return
    if ((hostel.images.length + files.length) > 10 || files.some(file => file.size > 5 * 1024 * 1024 || !['image/jpeg', 'image/png', 'image/webp'].includes(file.type))) { setError('Choose JPEG, PNG or WebP files up to 5 MiB each, with at most 10 photos per listing.'); return }
    const body = new FormData(); files.forEach(file => body.append('images', file))
    await perform(() => api(`/hostels/${hostel._id}/images`, { method: 'POST', body }), 'Photos uploaded. The listing is now a draft.')
  }
  function arrange(images, coverImage) { return perform(() => api(`/hostels/${hostel._id}/images`, { method: 'PUT', body: { publicIds: images.map(image => image.publicId), coverImage } }), 'Photo settings saved. The listing is now a draft.') }
  function move(index, offset) { const images = [...hostel.images]; [images[index], images[index + offset]] = [images[index + offset], images[index]]; arrange(images, hostel.coverImage || images[0].publicId) }
  const locked = busy || suspended || dirty
  return <div className="space-y-6">
    <div className="flex flex-wrap items-center justify-between gap-3"><Button secondary disabled={busy} onClick={() => { if (!dirty || window.confirm('Discard unsaved changes?')) onClose() }}>Back to listings</Button>{hostel && <Status value={hostel.status} />}</div>
    <ErrorNotice>{error}</ErrorNotice><Notice>{notice}</Notice>
    {suspended && <ErrorNotice>This listing is suspended. An administrator must restore it before you can edit or submit it.</ErrorNotice>}
    {hostel?.moderationReason && <p className="rounded-xl border border-line bg-raised px-4 py-3 text-sm text-limited">Review note: {hostel.moderationReason}</p>}
    <form onSubmit={save} className="panel rise !p-0">
      <div className="border-b border-line px-6 py-5"><h2 className="text-lg font-semibold tracking-tight">{hostel ? 'Listing details' : 'New listing'}</h2><p className="mt-1 text-sm text-muted">Students see these details on your listing page.</p></div>
      <fieldset disabled={busy || suspended} className="grid gap-5 p-6 sm:grid-cols-2">
        <Field label="Hostel name"><input className="input" required maxLength={150} value={form.name} onChange={update('name')} /></Field>
        <Field label="City"><input className="input" required maxLength={100} value={form.city} onChange={update('city')} /></Field>
        <div className="sm:col-span-2"><Field label="Full address"><input className="input" required maxLength={300} value={form.address} onChange={update('address')} /></Field></div>
        <div className="sm:col-span-2"><Field label="Description"><textarea className="input" required maxLength={5000} value={form.description} onChange={update('description')} /></Field></div>
        <div className="grid gap-5 border-t border-line pt-5 sm:col-span-2 sm:grid-cols-3">
          <Field label="Monthly price (PKR)"><input className="input" type="number" min={0} max={10000000} required value={form.price} onChange={update('price')} /></Field>
          <Field label="Available beds"><input className="input" type="number" min={0} max={10000} step={1} required value={form.beds} onChange={update('beds')} /></Field>
          <Field label="Residents"><select className="input" value={form.gender} onChange={update('gender')}><option value="ANY">Any</option><option value="MALE">Male</option><option value="FEMALE">Female</option></select></Field>
        </div>
        <div className="sm:col-span-2"><Field label="Amenities (comma separated)"><input className="input" value={form.amenities} onChange={update('amenities')} placeholder="WiFi, Laundry" /></Field></div>
      </fieldset>
      <div className="flex flex-wrap items-center justify-between gap-4 border-t border-line px-6 py-4"><p className="max-w-md text-xs leading-5 text-muted">Editing an approved listing returns it to draft and removes it from public search until it is approved again.</p><Button disabled={busy || suspended}>{busy ? 'Please wait…' : 'Save draft'}</Button></div>
    </form>
    {hostel && <section className="panel">
      <div className="flex flex-wrap items-end justify-between gap-4"><div><h2 className="text-lg font-semibold tracking-tight">Photos</h2><p className="mt-1 text-sm text-muted">JPEG, PNG or WebP · Up to 5 MiB each · Maximum 10 photos</p></div><label className={`btn btn-secondary ${locked ? 'pointer-events-none opacity-50' : 'cursor-pointer'}`}><ImagePlus size={16} aria-hidden="true" />Add photos<input aria-label="Upload photos" type="file" multiple accept="image/jpeg,image/png,image/webp" disabled={locked} onChange={upload} className="sr-only" /></label></div>
      {hostel.images.length ? <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{hostel.images.map((image, index) => <div key={image.publicId} className="overflow-hidden rounded-xl border border-line bg-raised"><div className="relative"><img src={image.url} alt={`Hostel photo ${index + 1}`} className="h-44 w-full object-cover" />{image.publicId === hostel.coverImage && <span className="absolute left-3 top-3 rounded-full bg-accent px-2.5 py-1 text-[11px] font-semibold text-on-accent">Cover</span>}</div><div className="flex flex-wrap gap-2 p-3"><Button secondary className="flex-1" disabled={locked || image.publicId === hostel.coverImage} onClick={() => arrange(hostel.images, image.publicId)}>{image.publicId === hostel.coverImage ? 'Cover photo' : 'Make cover'}</Button><Button secondary aria-label={`Move photo ${index + 1} earlier`} disabled={locked || index === 0} onClick={() => move(index, -1)}>←</Button><Button secondary aria-label={`Move photo ${index + 1} later`} disabled={locked || index === hostel.images.length - 1} onClick={() => move(index, 1)}>→</Button><Button secondary disabled={locked} onClick={() => perform(() => api(`/hostels/${hostel._id}/images`, { method: 'DELETE', body: { publicId: image.publicId } }), 'Photo removed. The listing is now a draft.')}>Remove</Button></div></div>)}</div> : <div className="mt-6"><Empty>No photos yet. Add at least one before submitting for review.</Empty></div>}
    </section>}
    {hostel && <section className="panel flex flex-wrap items-center justify-between gap-4"><div><h2 className="text-lg font-semibold tracking-tight">Review</h2><p className="mt-1 text-sm text-muted">{dirty ? 'Save your changes before managing photos or submitting.' : 'An administrator checks every listing before students can see it.'}</p></div><button className="btn btn-accent" disabled={locked || !hostel.images.length || !['DRAFT', 'REJECTED'].includes(hostel.status)} onClick={() => perform(() => api(`/hostels/${hostel._id}/submit`, { method: 'POST' }), 'Submitted for administrator review.')}>Submit for review</button></section>}
    {hostel && <section className="rounded-2xl border border-dashed border-line-strong p-6"><div className="flex flex-wrap items-center justify-between gap-4"><div><h2 className="font-semibold">Delete listing</h2><p className="mt-1 text-sm text-muted">Removes it from your account and public search. Conversations stay available.</p></div><Button secondary disabled={busy} onClick={() => setConfirmDelete(true)}><Trash2 size={16} aria-hidden="true" />Delete listing</Button></div>{confirmDelete && <div className="fade mt-4 flex flex-wrap items-center gap-3 rounded-xl border border-line bg-raised p-4"><p className="mr-auto text-sm text-danger">Remove this listing from your account and public search?</p><Button disabled={busy} onClick={async () => { setBusy(true); setError(''); try { await api(`/hostels/${hostel._id}`, { method: 'DELETE' }); onClose() } catch (cause) { setError(cause.message); setBusy(false) } }}>Confirm deletion</Button><Button secondary disabled={busy} onClick={() => setConfirmDelete(false)}>Cancel</Button></div>}</section>}
  </div>
}
