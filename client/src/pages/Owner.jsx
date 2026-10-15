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
const seatSizes = [1, 2, 3, 4, 5]
const facilityOptions = ['WiFi', 'Air conditioning', 'UPS / generator', 'Hot water', 'Laundry', 'Attached bathroom', 'Kitchen', 'Study room', 'Security guard', 'CCTV', 'Parking', 'Cleaning']
const mealOptions = [['0', 'No meals'], ['1', 'Once a day'], ['2', 'Twice a day'], ['3', 'Three times a day']]
const genderOptions = [['MALE', 'Men'], ['FEMALE', 'Women'], ['ANY', 'Co-ed (men and women)']]
const seaterLabel = seats => `${seats}-seater`
function listingForm(hostel) {
  const types = new Map((hostel?.seaterRooms || []).map(type => [type.seats, type]))
  const amenities = hostel?.amenities || []
  return {
    name: hostel?.name || '', city: hostel?.city || '', address: hostel?.address || '', description: hostel?.description || '',
    floors: hostel?.floors ?? '', totalRooms: hostel?.totalRooms ?? '',
    seaters: Object.fromEntries(seatSizes.map(seats => [seats, { rooms: types.get(seats)?.rooms ?? '', price: types.get(seats)?.pricePerBed ?? '' }])),
    gender: hostel?.gender || 'MALE',
    facilities: amenities.filter(item => facilityOptions.includes(item)), otherFacilities: amenities.filter(item => !facilityOptions.includes(item)).join(', '),
    mealsPerDay: hostel?.mealsPerDay === undefined ? '' : String(hostel.mealsPerDay), universities: (hostel?.universities || []).join(', '),
  }
}
const splitList = value => value.split(',').map(item => item.trim()).filter(Boolean)
function listingBody(form) {
  return {
    name: form.name, city: form.city, address: form.address, description: form.description,
    floors: Number(form.floors), totalRooms: Number(form.totalRooms),
    seaterRooms: seatSizes.map(seats => ({ seats, rooms: Number(form.seaters[seats].rooms || 0), pricePerBed: Number(form.seaters[seats].price || 0) })),
    gender: form.gender, amenities: [...form.facilities, ...splitList(form.otherFacilities)], mealsPerDay: Number(form.mealsPerDay), universities: splitList(form.universities),
  }
}
function Step({ number, title, hint, children }) {
  return <section className="grid gap-4 border-t border-line px-6 py-6 first:border-t-0"><div><h3 className="font-semibold"><span className="mr-2 font-mono text-xs text-faint">{String(number).padStart(2, '0')}</span>{title}</h3>{hint && <p className="mt-1 text-sm text-muted">{hint}</p>}</div>{children}</section>
}
export function OwnerListings() {
  const [page, setPage] = useState(1)
  const list = useResource(`/owner/hostels?page=${page}`)
  const [editing, setEditing] = useState(undefined)
  const [generation, setGeneration] = useState(0)
  return <Page eyebrow="Property management" title="Your hostels." description="Save a draft, upload photos, then submit it for review." action={<button className="btn btn-accent" onClick={() => { setEditing(null); setGeneration(value => value + 1) }}><Plus size={16} aria-hidden="true" />Create listing</button>}><ErrorNotice retry={list.reload}>{list.error}</ErrorNotice>{editing !== undefined ? <ListingEditor key={generation} initial={editing} onClose={() => { setEditing(undefined); list.reload() }} onSaved={list.reload} /> : list.loading ? <Loading /> : <><div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">{list.result?.data.map(hostel => <article key={hostel._id} className="lift rise flex flex-col overflow-hidden rounded-2xl border border-line bg-surface"><div className="p-2"><Cover hostel={hostel} className="h-48 w-full" /></div><div className="flex flex-1 flex-col p-5 pt-3"><div className="flex flex-wrap items-start justify-between gap-3"><h2 className="text-lg font-semibold tracking-tight">{hostel.name}</h2><Status value={hostel.status} /></div><p className="mt-1.5 flex items-center gap-1.5 text-sm text-muted"><MapPin size={14} aria-hidden="true" />{hostel.city}</p><p className="mt-3 text-sm">{hostel.seaterRooms?.length ? <span className="text-muted">from </span> : null}<span className="font-semibold">PKR {hostel.price.toLocaleString()}</span><span className="text-muted">{hostel.seaterRooms?.length ? " per bed" : " / month"} · {hostel.beds} beds</span></p>{hostel.moderationReason && <p className="mt-3 rounded-lg bg-raised px-3 py-2 text-sm text-limited">Review note: {hostel.moderationReason}</p>}<div className="mt-auto pt-5"><Button secondary className="w-full" onClick={() => { setEditing(hostel); setGeneration(value => value + 1) }}>Manage listing</Button></div></div></article>)}</div>{list.result?.data.length === 0 && <Empty>You have no listings. Create your first hostel to get started.</Empty>}<Pagination pagination={list.result?.pagination} onChange={setPage} /></>}</Page>
}
// The video lives on the owner's YouTube channel; the listing only keeps its link.
function VideoTour({ hostel, locked, perform }) {
  const current = hostel.youtubeId ? `https://youtu.be/${hostel.youtubeId}` : ''
  const [link, setLink] = useState(current)
  const save = (url, message) => perform(() => api(`/hostels/${hostel._id}/video`, { method: 'PUT', body: { url } }), message)
  return <section className="panel !p-0">
    <div className="border-b border-line px-6 py-5"><h2 className="text-lg font-semibold tracking-tight"><span className="mr-2 font-mono text-xs text-faint">14</span>Video tour <span className="ml-2 text-xs font-normal text-faint">Optional</span></h2><p className="mt-1 text-sm text-muted">Show students around with a short walkthrough video hosted on YouTube.</p></div>
    <div className="grid gap-5 px-6 py-5">
      <ol className="list-decimal space-y-1 pl-5 text-sm text-muted"><li>Upload your video on <a className="text-accent-ink underline" href="https://www.youtube.com/upload" target="_blank" rel="noreferrer">YouTube</a>.</li><li>Set its visibility to <strong>Unlisted</strong>, so only people with the link can watch it.</li><li>Copy the video's link (Share → Copy) and paste it below.</li></ol>
      <form className="flex flex-wrap gap-3" onSubmit={event => { event.preventDefault(); save(link, 'Video saved. The listing is now a draft.') }}><input className="input min-w-0 flex-1" type="url" inputMode="url" required maxLength={300} placeholder="https://youtu.be/…" value={link} onChange={event => setLink(event.target.value)} aria-label="YouTube video link" disabled={locked} /><Button disabled={locked || !link.trim() || link.trim() === current}>Save video</Button>{hostel.youtubeId && <Button secondary disabled={locked} onClick={() => { setLink(''); save('', 'Video removed. The listing is now a draft.') }}>Remove</Button>}</form>
      {hostel.youtubeId && <div className="aspect-video w-full max-w-2xl overflow-hidden rounded-xl border border-line bg-raised"><iframe className="h-full w-full" src={`https://www.youtube-nocookie.com/embed/${hostel.youtubeId}`} title={`${hostel.name} video tour`} loading="lazy" allow="accelerometer; encrypted-media; gyroscope; picture-in-picture" allowFullScreen /></div>}
    </div>
  </section>
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
  const change = next => { setForm(current => ({ ...current, ...next(current) })); setDirty(true); setNotice('') }
  const update = key => event => { const { value } = event.target; change(() => ({ [key]: value })) }
  const updateSeater = (seats, key) => event => { const { value } = event.target; change(current => ({ seaters: { ...current.seaters, [seats]: { ...current.seaters[seats], [key]: value } } })) }
  const toggleFacility = item => change(current => ({ facilities: current.facilities.includes(item) ? current.facilities.filter(value => value !== item) : [...current.facilities, item] }))
  const assigned = seatSizes.reduce((sum, seats) => sum + Number(form.seaters[seats].rooms || 0), 0)
  const total = Number(form.totalRooms || 0)
  const overAssigned = total > 0 && assigned > total
  async function perform(action, message) {
    setBusy(true); setError(''); setNotice('')
    try { const result = await action(); if (result?.data) setHostel(result.data); setNotice(message); onSaved(); return result }
    catch (cause) { setError(cause.message); return null } finally { setBusy(false) }
  }
  async function save(event) {
    event.preventDefault()
    if (overAssigned) { setError(`You entered ${assigned} rooms by size, but only ${total} rooms in total.`); return }
    if (!assigned) { setError('Enter how many rooms of at least one size you have.'); return }
    const result = await perform(() => api(hostel ? `/hostels/${hostel._id}` : '/hostels', { method: hostel ? 'PUT' : 'POST', body: listingBody(form) }), 'Saved. Now add a photo of each room size, then submit it for review.')
    if (result) setDirty(false)
  }
  async function upload(event, seats) {
    const files = Array.from(event.target.files || []); event.target.value = ''
    if (!files.length) return
    if ((hostel.images.length + files.length) > 10 || files.some(file => file.size > 5 * 1024 * 1024 || !['image/jpeg', 'image/png', 'image/webp'].includes(file.type))) { setError('Choose JPEG, PNG or WebP files up to 5 MiB each, with at most 10 photos per listing.'); return }
    const body = new FormData(); body.append('seats', String(seats)); files.forEach(file => body.append('images', file))
    await perform(() => api(`/hostels/${hostel._id}/images`, { method: 'POST', body }), `${seaterLabel(seats)} photo uploaded. The listing is now a draft.`)
  }
  const arrange = (images, coverImage) => perform(() => api(`/hostels/${hostel._id}/images`, { method: 'PUT', body: { publicIds: images.map(image => image.publicId), coverImage } }), 'Cover photo changed. The listing is now a draft.')
  const removePhoto = image => perform(() => api(`/hostels/${hostel._id}/images`, { method: 'DELETE', body: { publicId: image.publicId } }), 'Photo removed. The listing is now a draft.')
  const locked = busy || suspended || dirty
  const savedTypes = hostel?.seaterRooms || []
  const missingPhotos = savedTypes.filter(type => !hostel.images.some(image => image.seats === type.seats))
  const otherPhotos = hostel ? hostel.images.filter(image => !savedTypes.some(type => type.seats === image.seats)) : []
  const photoTile = image => <div key={image.publicId} className="overflow-hidden rounded-xl border border-line bg-raised"><div className="relative"><img src={image.url} alt={image.seats ? `${seaterLabel(image.seats)} room` : 'Hostel photo'} className="h-36 w-full object-cover" />{image.publicId === hostel.coverImage && <span className="absolute left-3 top-3 rounded-full bg-accent px-2.5 py-1 text-[11px] font-semibold text-on-accent">Cover</span>}</div><div className="flex gap-2 p-2"><Button secondary className="flex-1 !min-h-9 !px-2 !text-xs" disabled={locked || image.publicId === hostel.coverImage} onClick={() => arrange(hostel.images, image.publicId)}>{image.publicId === hostel.coverImage ? 'Cover photo' : 'Make cover'}</Button><Button secondary className="!min-h-9 !px-2 !text-xs" disabled={locked} onClick={() => removePhoto(image)}>Remove</Button></div></div>
  return <div className="space-y-6">
    <div className="flex flex-wrap items-center justify-between gap-3"><Button secondary disabled={busy} onClick={() => { if (!dirty || window.confirm('Discard unsaved changes?')) onClose() }}>Back to listings</Button>{hostel && <Status value={hostel.status} />}</div>
    <ErrorNotice>{error}</ErrorNotice><Notice>{notice}</Notice>
    {suspended && <ErrorNotice>This listing is suspended. An administrator must restore it before you can edit or submit it.</ErrorNotice>}
    {hostel?.moderationReason && <p className="rounded-xl border border-line bg-raised px-4 py-3 text-sm text-limited">Review note: {hostel.moderationReason}</p>}
    <form onSubmit={save} className="panel rise !p-0">
      <div className="border-b border-line px-6 py-5"><h2 className="text-lg font-semibold tracking-tight">{hostel ? 'Listing details' : 'New listing'}</h2><p className="mt-1 text-sm text-muted">Students see these details on your listing page.</p></div>
      <fieldset disabled={busy || suspended}>
        <Step number={1} title="Hostel name"><input className="input" required maxLength={150} value={form.name} onChange={update('name')} /></Step>
        <Step number={2} title="City"><input className="input" required maxLength={100} value={form.city} onChange={update('city')} placeholder="Lahore" /></Step>
        <Step number={3} title="Address"><input className="input" required maxLength={300} value={form.address} onChange={update('address')} placeholder="Street, area" /></Step>
        <Step number={4} title="Description" hint="Tell students what living here is like."><textarea className="input min-h-28" required maxLength={5000} value={form.description} onChange={update('description')} /></Step>
        <Step number={5} title="Number of floors"><input className="input max-w-40" type="number" required min={1} max={50} step={1} value={form.floors} onChange={update('floors')} /></Step>
        <Step number={6} title="Total number of rooms"><input className="input max-w-40" type="number" required min={1} max={1000} step={1} value={form.totalRooms} onChange={update('totalRooms')} /></Step>
        <Step number={7} title="Rooms by size" hint="How many rooms have 1, 2, 3, 4 or 5 beds? Leave a size empty if you don't have it.">
          <div className="grid gap-3 sm:grid-cols-5">{seatSizes.map(seats => <Field key={seats} label={seaterLabel(seats)}><input className="input" type="number" min={0} max={1000} step={1} placeholder="0" value={form.seaters[seats].rooms} onChange={updateSeater(seats, 'rooms')} /></Field>)}</div>
          <p role="status" className={`text-sm ${overAssigned ? 'text-danger' : 'text-muted'}`}>{assigned} of {total || '—'} rooms assigned{overAssigned && ' — this is more than your total number of rooms.'}</p>
        </Step>
        <Step number={8} title="Price of one bed per month (PKR)" hint="For each room size you have.">
          {assigned ? <div className="grid gap-3 sm:grid-cols-5">{seatSizes.filter(seats => Number(form.seaters[seats].rooms) > 0).map(seats => <Field key={seats} label={`${seaterLabel(seats)} bed`}><input className="input" type="number" required min={1} max={10000000} value={form.seaters[seats].price} onChange={updateSeater(seats, 'price')} /></Field>)}</div> : <p className="text-sm text-faint">Enter your rooms by size first.</p>}
        </Step>
        <Step number={9} title="Who can stay?"><div role="radiogroup" aria-label="Residents" className="flex flex-wrap gap-2">{genderOptions.map(([value, label]) => <label key={value} className={`btn min-h-10 cursor-pointer px-4 ${form.gender === value ? 'btn-primary' : 'btn-secondary'}`}><input type="radio" name="gender" value={value} checked={form.gender === value} onChange={update('gender')} className="sr-only" />{label}</label>)}</div></Step>
        <Step number={10} title="Facilities">
          <div className="grid gap-2 sm:grid-cols-3">{facilityOptions.map(item => <label key={item} className="flex min-h-10 cursor-pointer items-center gap-2.5 rounded-lg border border-line px-3 text-sm"><input type="checkbox" checked={form.facilities.includes(item)} onChange={() => toggleFacility(item)} />{item}</label>)}</div>
          <Field label="Other facilities (comma separated)"><input className="input" maxLength={500} value={form.otherFacilities} onChange={update('otherFacilities')} placeholder="Gym, Rooftop" /></Field>
        </Step>
        <Step number={11} title="Meals"><select className="input max-w-64" required value={form.mealsPerDay} onChange={update('mealsPerDay')}><option value="" disabled>Choose…</option>{mealOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Step>
        <Step number={12} title="Nearby universities" hint="Separate them with commas."><input className="input" maxLength={1000} value={form.universities} onChange={update('universities')} placeholder="University of the Punjab, UCP, FAST" /></Step>
      </fieldset>
      <div className="flex flex-wrap items-center justify-between gap-4 border-t border-line px-6 py-4"><p className="max-w-md text-xs leading-5 text-muted">Editing an approved listing returns it to draft and removes it from public search until it is approved again.</p><Button disabled={busy || suspended || overAssigned}>{busy ? 'Please wait…' : hostel ? 'Save changes' : 'Save and continue'}</Button></div>
    </form>
    {hostel && <section className="panel !p-0">
      <div className="border-b border-line px-6 py-5"><h2 className="text-lg font-semibold tracking-tight"><span className="mr-2 font-mono text-xs text-faint">13</span>Room photos</h2><p className="mt-1 text-sm text-muted">Upload at least one photo of each room size you have. JPEG, PNG or WebP · up to 5 MiB · 10 photos in total.</p>{dirty && <p className="mt-2 text-sm text-limited">Save your changes before managing photos.</p>}</div>
      {savedTypes.length ? savedTypes.map(type => { const photos = hostel.images.filter(image => image.seats === type.seats); return <div key={type.seats} className="border-b border-line px-6 py-5 last:border-b-0"><div className="flex flex-wrap items-center justify-between gap-3"><h3 className="font-semibold">{seaterLabel(type.seats)} rooms <span className={`ml-2 text-xs font-normal ${photos.length ? 'text-open' : 'text-limited'}`}>{photos.length ? `${photos.length} photo${photos.length > 1 ? 's' : ''}` : 'Photo needed'}</span></h3><label className={`btn btn-secondary ${locked ? 'pointer-events-none opacity-50' : 'cursor-pointer'}`}><ImagePlus size={16} aria-hidden="true" />Add {seaterLabel(type.seats)} photo<input aria-label={`Upload ${seaterLabel(type.seats)} room photos`} type="file" multiple accept="image/jpeg,image/png,image/webp" disabled={locked} onChange={event => upload(event, type.seats)} className="sr-only" /></label></div>{photos.length > 0 && <div className="mt-4 grid gap-3 sm:grid-cols-3 lg:grid-cols-4">{photos.map(photoTile)}</div>}</div> }) : <div className="px-6 py-5"><Empty>Save your rooms by size first.</Empty></div>}
      {otherPhotos.length > 0 && <div className="border-t border-line px-6 py-5"><h3 className="font-semibold">Other photos</h3><div className="mt-4 grid gap-3 sm:grid-cols-3 lg:grid-cols-4">{otherPhotos.map(photoTile)}</div></div>}
    </section>}
    {hostel && <VideoTour hostel={hostel} locked={locked} perform={perform} />}
    {hostel && <section className="panel flex flex-wrap items-center justify-between gap-4"><div><h2 className="text-lg font-semibold tracking-tight">Review</h2><p className="mt-1 text-sm text-muted">{dirty ? 'Save your changes before submitting.' : missingPhotos.length ? `Add a photo of your ${missingPhotos.map(type => seaterLabel(type.seats)).join(', ')} room${missingPhotos.length > 1 ? 's' : ''} to submit.` : 'An administrator checks every listing before students can see it.'}</p></div><button className="btn btn-accent" disabled={locked || !hostel.images.length || missingPhotos.length > 0 || !['DRAFT', 'REJECTED'].includes(hostel.status)} onClick={() => perform(() => api(`/hostels/${hostel._id}/submit`, { method: 'POST' }), 'Submitted for administrator review.')}>Submit for review</button></section>}
    {hostel && <section className="rounded-2xl border border-dashed border-line-strong p-6"><div className="flex flex-wrap items-center justify-between gap-4"><div><h2 className="font-semibold">Delete listing</h2><p className="mt-1 text-sm text-muted">Removes it from your account and public search. Conversations stay available.</p></div><Button secondary disabled={busy} onClick={() => setConfirmDelete(true)}><Trash2 size={16} aria-hidden="true" />Delete listing</Button></div>{confirmDelete && <div className="fade mt-4 flex flex-wrap items-center gap-3 rounded-xl border border-line bg-raised p-4"><p className="mr-auto text-sm text-danger">Remove this listing from your account and public search?</p><Button disabled={busy} onClick={async () => { setBusy(true); setError(''); try { await api(`/hostels/${hostel._id}`, { method: 'DELETE' }); onClose() } catch (cause) { setError(cause.message); setBusy(false) } }}>Confirm deletion</Button><Button secondary disabled={busy} onClick={() => setConfirmDelete(false)}>Cancel</Button></div>}</section>}
  </div>
}
