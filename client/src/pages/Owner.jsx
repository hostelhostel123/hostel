import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { api } from '../services/api'
import { ArrowRight, ImagePlus, MapPin, MessageCircle, Plus, Trash2 } from 'lucide-react'
import { FloorPlan, FloorTabs, PlanLegend } from '../components/FloorPlan'
import { floorName, floorsOf } from '../lib/rooms'
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
const blankRoom = (seats = 2, bath = 'SHARED') => ({ key: Math.random().toString(36).slice(2), code: '', seats, bath, available: '', seatPrices: [] })
const autoCode = (floor, index) => `${floor === 0 ? 'G' : floor}${String(index + 1).padStart(2, '0')}`
const floorLabel = floor => floor === 0 ? 'Ground floor' : `Floor ${floor}`
// Rebuilds the floors → rooms editor from a saved listing. Older listings saved only "rooms by size", so their
// rooms are spread across the floors they declared; nothing the owner entered before is lost.
function planFrom(hostel) {
  const rates = Object.fromEntries(seatSizes.map(seats => [seats, '']))
  if (hostel?.rooms?.length && hostel.rooms.some(room => room.bath)) {
    const floors = Array.from({ length: Math.max(...hostel.rooms.map(room => room.floor || 0)) + 1 }, () => ({ rooms: [] }))
    for (const room of hostel.rooms) floors[room.floor || 0].rooms.push({ ...blankRoom(room.seats, room.bath || 'SHARED'), code: room.code, available: String(room.available), seatPrices: (room.seatPrices || []).map(String) })
    for (const rate of hostel.pricing?.rates || []) rates[rate.seats] = String(rate.price)
    return { mode: hostel.pricing?.mode || 'STANDARD', floors, rates, attachedBathExtra: hostel.pricing?.attachedBathExtra ? String(hostel.pricing.attachedBathExtra) : '' }
  }
  const sizes = (hostel?.seaterRooms || []).flatMap(type => Array.from({ length: type.rooms }, () => type.seats))
  const count = Math.max(1, hostel?.floors || 1)
  const perFloor = Math.ceil(sizes.length / count) || 1
  const floors = Array.from({ length: count }, (_, floor) => ({ rooms: sizes.slice(floor * perFloor, (floor + 1) * perFloor).map(seats => blankRoom(seats)) }))
  for (const type of hostel?.seaterRooms || []) rates[type.seats] = String(type.pricePerBed)
  return { mode: 'STANDARD', floors, rates, attachedBathExtra: '' }
}
function listingForm(hostel) {
  const amenities = hostel?.amenities || []
  return {
    name: hostel?.name || '', city: hostel?.city || '', address: hostel?.address || '', description: hostel?.description || '',
    plan: planFrom(hostel),
    gender: hostel?.gender || 'MALE',
    facilities: amenities.filter(item => facilityOptions.includes(item)), otherFacilities: amenities.filter(item => !facilityOptions.includes(item)).join(', '),
    mealsPerDay: hostel?.mealsPerDay === undefined ? '' : String(hostel.mealsPerDay), universities: (hostel?.universities || []).join(', '),
  }
}
// Same rule the API applies, so owners see the price range students will see before saving.
function seatPrices(room, plan) {
  if (plan.mode === 'CUSTOM') return Array.from({ length: room.seats }, (_, index) => Number(room.seatPrices[index] || 0))
  const price = Number(plan.rates[room.seats] || 0) + (room.bath === 'ATTACHED' ? Number(plan.attachedBathExtra || 0) : 0)
  return Array.from({ length: room.seats }, () => price)
}
function planProblem(plan) {
  const rooms = plan.floors.flatMap(floor => floor.rooms)
  if (!rooms.length) return 'Add at least one room.'
  if (rooms.some(room => room.available !== '' && Number(room.available) > room.seats)) return 'A room has more free seats than it has seats.'
  if (plan.mode === 'STANDARD') {
    const missing = [...new Set(rooms.map(room => room.seats))].sort().filter(seats => !(Number(plan.rates[seats]) > 0))
    if (missing.length) return `Enter the price of a bed in ${missing.map(seaterLabel).join(', ')} rooms.`
  } else if (rooms.some(room => seatPrices(room, plan).some(price => !(price > 0)))) return 'Enter a price for every seat in every room.'
  return ''
}
const splitList = value => value.split(',').map(item => item.trim()).filter(Boolean)
function listingBody(form) {
  const { plan } = form
  return {
    name: form.name, city: form.city, address: form.address, description: form.description,
    floorPlan: { floors: plan.floors.map(floor => ({ rooms: floor.rooms.map(room => ({
      ...(room.code.trim() && { code: room.code.trim() }), seats: room.seats, bath: room.bath,
      ...(room.available !== '' && { available: Number(room.available) }),
      ...(plan.mode === 'CUSTOM' && { seatPrices: seatPrices(room, plan) }),
    })) })) },
    pricing: plan.mode === 'CUSTOM' ? { mode: 'CUSTOM' } : { mode: 'STANDARD', rates: seatSizes.filter(seats => Number(plan.rates[seats]) > 0).map(seats => ({ seats, price: Number(plan.rates[seats]) })), attachedBathExtra: Number(plan.attachedBathExtra || 0) },
    gender: form.gender, amenities: [...form.facilities, ...splitList(form.otherFacilities)], mealsPerDay: Number(form.mealsPerDay), universities: splitList(form.universities),
  }
}
function Step({ number, title, hint, htmlFor, children }) {
  const Title = htmlFor ? 'label' : 'h3'
  return <section className="grid gap-4 border-t border-line px-6 py-6 first:border-t-0"><div><Title htmlFor={htmlFor} className="block font-semibold"><span className="mr-2 tabular-nums text-xs text-faint">{String(number).padStart(2, '0')}</span>{title}</Title>{hint && <p className="mt-1 text-sm text-muted">{hint}</p>}</div>{children}</section>
}
const plural = (count, word) => `${count} ${word}${count === 1 ? '' : 's'}`
function FloorsEditor({ plan, onChange }) {
  const [quick, setQuick] = useState({ count: '4', seats: '2', bath: 'SHARED' })
  const setFloors = floors => onChange({ floors })
  const setRoom = (floor, index, next) => setFloors(plan.floors.map((entry, f) => f !== floor ? entry : { rooms: entry.rooms.map((room, i) => i !== index ? room : { ...room, ...next }) }))
  function setFloorCount(value) {
    const count = Math.min(20, Math.max(1, Number(value) || 1))
    const dropped = plan.floors.slice(count).reduce((sum, floor) => sum + floor.rooms.length, 0)
    if (dropped && !window.confirm(`Remove the top ${plural(plan.floors.length - count, 'floor')} and their ${plural(dropped, 'room')}?`)) return
    setFloors(Array.from({ length: count }, (_, floor) => plan.floors[floor] || { rooms: [] }))
  }
  const addRooms = floor => setFloors(plan.floors.map((entry, f) => f !== floor ? entry : { rooms: [...entry.rooms, ...Array.from({ length: Math.min(40 - entry.rooms.length, Math.max(1, Number(quick.count) || 1)) }, () => blankRoom(Number(quick.seats), quick.bath))] }))
  const copyFloor = floor => setFloors(plan.floors.map((entry, f) => f !== floor ? entry : { rooms: plan.floors[floor - 1].rooms.map(room => ({ ...room, key: blankRoom().key, code: '' })) }))
  return <div className="grid gap-5">
    <div className="flex flex-wrap items-end gap-4"><Field label="Number of floors"><input className="input w-32" type="number" min={1} max={20} step={1} value={plan.floors.length} onChange={event => setFloorCount(event.target.value)} /></Field>
      <fieldset className="flex flex-wrap items-end gap-2 rounded-xl border border-line bg-raised p-3"><legend className="sr-only">Rooms to add</legend><Field label="Add"><input className="input w-20" type="number" min={1} max={40} value={quick.count} onChange={event => setQuick(current => ({ ...current, count: event.target.value }))} aria-label="How many rooms to add" /></Field><Field label="Seats per room"><select className="input w-28" value={quick.seats} onChange={event => setQuick(current => ({ ...current, seats: event.target.value }))}>{seatSizes.map(seats => <option key={seats} value={seats}>{seaterLabel(seats)}</option>)}</select></Field><Field label="Bathroom"><select className="input w-32" value={quick.bath} onChange={event => setQuick(current => ({ ...current, bath: event.target.value }))}><option value="SHARED">Shared</option><option value="ATTACHED">Attached</option></select></Field></fieldset>
    </div>
    {plan.floors.map((entry, floor) => <section key={floor} aria-label={floorLabel(floor)} className="overflow-hidden rounded-xl border border-line">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-raised px-4 py-3"><h4 className="font-semibold">{floorLabel(floor)} <span className="ml-1 text-sm font-normal text-muted">{plural(entry.rooms.length, 'room')} · {plural(entry.rooms.reduce((sum, room) => sum + room.seats, 0), 'bed')}</span></h4><div className="flex flex-wrap gap-2">{floor > 0 && plan.floors[floor - 1].rooms.length > 0 && <Button type="button" secondary className="!min-h-9 !px-3 !text-xs" onClick={() => copyFloor(floor)}>Same rooms as {floorLabel(floor - 1).toLowerCase()}</Button>}<Button type="button" secondary className="!min-h-9 !px-3 !text-xs" disabled={entry.rooms.length >= 40} onClick={() => addRooms(floor)}><Plus size={14} aria-hidden="true" />Add {plural(Number(quick.count) || 1, 'room')} to {floorLabel(floor).toLowerCase()}</Button></div></div>
      {entry.rooms.length ? <div className="overflow-x-auto"><table className="w-full min-w-[560px] text-sm"><thead><tr className="text-left text-xs text-faint"><th scope="col" className="px-4 py-2 font-medium">Room</th><th scope="col" className="px-2 py-2 font-medium">Seats</th><th scope="col" className="px-2 py-2 font-medium">Bathroom</th><th scope="col" className="px-2 py-2 font-medium">Free seats</th>{plan.mode === 'CUSTOM' && <th scope="col" className="px-2 py-2 font-medium">Price of each seat (PKR / month)</th>}<th scope="col"><span className="sr-only">Remove</span></th></tr></thead>
        <tbody>{entry.rooms.map((room, index) => { const name = room.code || autoCode(floor, index); return <tr key={room.key} className="border-t border-line">
          <td className="px-4 py-2"><input className="input !h-10 w-24" maxLength={20} placeholder={autoCode(floor, index)} value={room.code} onChange={event => setRoom(floor, index, { code: event.target.value })} aria-label={`Room ${name} name`} /></td>
          <td className="px-2 py-2"><select className="input !h-10 w-28" value={room.seats} onChange={event => setRoom(floor, index, { seats: Number(event.target.value) })} aria-label={`Room ${name} seats`}>{seatSizes.map(seats => <option key={seats} value={seats}>{seaterLabel(seats)}</option>)}</select></td>
          <td className="px-2 py-2"><select className="input !h-10 w-32" value={room.bath} onChange={event => setRoom(floor, index, { bath: event.target.value })} aria-label={`Room ${name} bathroom`}><option value="SHARED">Shared</option><option value="ATTACHED">Attached</option></select></td>
          <td className="px-2 py-2"><input className="input !h-10 w-20" type="number" min={0} max={room.seats} placeholder={String(room.seats)} value={room.available} onChange={event => setRoom(floor, index, { available: event.target.value })} aria-label={`Room ${name} free seats`} /></td>
          {plan.mode === 'CUSTOM' && <td className="px-2 py-2"><div className="flex flex-wrap gap-1.5">{Array.from({ length: room.seats }, (_, seat) => <input key={seat} className="input !h-10 w-24" type="number" min={1} max={10000000} placeholder={`Seat ${seat + 1}`} value={room.seatPrices[seat] ?? ''} onChange={event => setRoom(floor, index, { seatPrices: Object.assign([...room.seatPrices], { [seat]: event.target.value }) })} aria-label={`Room ${name} seat ${seat + 1} price`} />)}</div></td>}
          <td className="px-2 py-2 text-right"><button type="button" className="grid h-10 w-10 place-items-center rounded-lg text-muted hover:bg-raised hover:text-ink" onClick={() => setFloors(plan.floors.map((item, f) => f !== floor ? item : { rooms: item.rooms.filter((_, i) => i !== index) }))} aria-label={`Remove room ${name}`}><Trash2 size={15} aria-hidden="true" /></button></td>
        </tr> })}</tbody></table></div> : <p className="px-4 py-5 text-sm text-faint">No rooms on this floor yet. Use “Add rooms” above.</p>}
    </section>)}
  </div>
}
function PricingEditor({ plan, onChange }) {
  const sizes = [...new Set(plan.floors.flatMap(floor => floor.rooms.map(room => room.seats)))].sort()
  const hasAttached = plan.floors.some(floor => floor.rooms.some(room => room.bath === 'ATTACHED'))
  const prices = plan.floors.flatMap(floor => floor.rooms.flatMap(room => seatPrices(room, plan))).filter(price => price > 0)
  // Switching to per-seat pricing starts every seat at its standard price, so owners only change the exceptions.
  function setMode(mode) {
    if (mode === 'CUSTOM' && plan.mode === 'STANDARD') onChange({ mode, floors: plan.floors.map(floor => ({ rooms: floor.rooms.map(room => ({ ...room, seatPrices: room.seatPrices.length ? room.seatPrices : seatPrices(room, plan).map(price => price ? String(price) : '') })) })) })
    else onChange({ mode })
  }
  return <div className="grid gap-5">
    <div role="radiogroup" aria-label="How rooms are priced" className="grid gap-3 sm:grid-cols-2">{[['STANDARD', 'Standard rates', 'One bed price for each room size, plus an extra charge for an attached bathroom.'], ['CUSTOM', 'Price each seat', 'Set the price of every seat in every room yourself, in the room list above.']].map(([value, title, text]) => <label key={value} className={`flex cursor-pointer gap-3 rounded-xl border p-4 transition-colors ${plan.mode === value ? 'border-accent bg-accent-soft' : 'border-line hover:border-line-strong'}`}><input type="radio" name="pricing-mode" value={value} checked={plan.mode === value} onChange={() => setMode(value)} className="mt-1" /><span><span className="block font-semibold">{title}</span><span className="mt-1 block text-sm text-muted">{text}</span></span></label>)}</div>
    {plan.mode === 'STANDARD' && (sizes.length ? <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">{sizes.map(seats => <Field key={seats} label={`${seaterLabel(seats)} bed (PKR / month)`}><input className="input" type="number" min={1} max={10000000} value={plan.rates[seats]} onChange={event => onChange({ rates: { ...plan.rates, [seats]: event.target.value } })} /></Field>)}{hasAttached && <Field label="Attached bathroom extra, per bed"><input className="input" type="number" min={0} max={10000000} placeholder="0" value={plan.attachedBathExtra} onChange={event => onChange({ attachedBathExtra: event.target.value })} /></Field>}</div> : <p className="text-sm text-faint">Add rooms first.</p>)}
    <p aria-live="polite" className="rounded-xl bg-raised px-4 py-3 text-sm">{prices.length ? <>Students will see <strong className="tabular-nums">PKR {Math.min(...prices).toLocaleString()}{Math.max(...prices) > Math.min(...prices) ? ` – ${Math.max(...prices).toLocaleString()}` : ''}</strong> per bed per month.</> : <span className="text-muted">Enter prices to see the range students will see.</span>}</p>
  </div>
}
export function OwnerListings() {
  const [page, setPage] = useState(1)
  const list = useResource(`/owner/hostels?page=${page}`)
  const [editing, setEditing] = useState(undefined)
  const [generation, setGeneration] = useState(0)
  return <Page eyebrow="Property management" title="Your hostels." description="Save a draft, upload photos, then submit it for review." action={<button className="btn btn-accent" onClick={() => { setEditing(null); setGeneration(value => value + 1) }}><Plus size={16} aria-hidden="true" />Create listing</button>}><ErrorNotice retry={list.reload}>{list.error}</ErrorNotice>{editing !== undefined ? <ListingEditor key={generation} initial={editing} onClose={() => { setEditing(undefined); list.reload() }} onSaved={list.reload} /> : list.loading ? <Loading /> : <><div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">{list.result?.data.map(hostel => <article key={hostel._id} className="lift rise flex flex-col overflow-hidden rounded-2xl border border-line bg-surface"><div className="p-2"><Cover hostel={hostel} className="h-48 w-full" /></div><div className="flex flex-1 flex-col p-5 pt-3"><div className="flex flex-wrap items-start justify-between gap-3"><h2 className="text-lg font-semibold tracking-tight">{hostel.name}</h2><Status value={hostel.status} /></div><p className="mt-1.5 flex items-center gap-1.5 text-sm text-muted"><MapPin size={14} aria-hidden="true" />{hostel.city}</p><p className="mt-3 text-sm">{hostel.seaterRooms?.length ? <span className="text-muted">from </span> : null}<span className="font-semibold">PKR {hostel.price.toLocaleString()}</span><span className="text-muted">{hostel.seaterRooms?.length ? " per bed" : " / month"} · {hostel.beds} beds</span></p>{hostel.moderationReason && <p className="mt-3 rounded-lg bg-raised px-3 py-2 text-sm text-limited">Review note: {hostel.moderationReason}</p>}<div className="mt-auto pt-5"><Button secondary className="w-full" onClick={() => { setEditing(hostel); setGeneration(value => value + 1) }}>Manage listing</Button></div></div></article>)}</div>{list.result?.data.length === 0 && <Empty>You have no listings. Create your first hostel to get started.</Empty>}<Pagination pagination={list.result?.pagination} onChange={setPage} /></>}</Page>
}
// What students will see: the plan the API generated from the saved floors and rooms.
function PlanPreview({ hostel, dirty }) {
  const floors = floorsOf(hostel)
  const [floor, setFloor] = useState(floors[0] || 0)
  const [selected, setSelected] = useState('')
  const shown = floors.includes(floor) ? floor : floors[0]
  const onFloor = item => (item.floor || 0) === shown
  return <section className="panel !p-0">
    <div className="border-b border-line px-6 py-5"><h2 className="text-lg font-semibold tracking-tight"><span className="mr-2 tabular-nums text-xs text-faint">12</span>Floor plan</h2><p className="mt-1 text-sm text-muted">Drawn automatically from your floors and rooms. This is what students see when they choose a room.</p>{dirty && <p className="mt-2 text-sm text-limited">Save your changes to update the plan.</p>}</div>
    <div className="overflow-hidden bg-plan"><div className="flex flex-wrap items-center justify-between gap-4 border-b border-plan-edge px-5 py-4">{floors.length > 1 ? <FloorTabs floors={floors} floor={shown} onChange={setFloor} /> : <p className="text-sm font-medium text-plan-text">{floorName(shown)}</p>}<PlanLegend /></div>
      <div className="overflow-x-auto p-2 sm:p-4"><div key={shown} className="fade relative min-w-[680px]"><FloorPlan rooms={hostel.rooms.filter(onFloor)} areas={(hostel.areas || []).filter(onFloor)} selected={selected} onSelect={setSelected} /></div></div></div>
  </section>
}
// The video lives on the owner's YouTube channel; the listing only keeps its link.
function VideoTour({ hostel, locked, perform }) {
  const current = hostel.youtubeId ? `https://youtu.be/${hostel.youtubeId}` : ''
  const [link, setLink] = useState(current)
  const save = (url, message) => perform(() => api(`/hostels/${hostel._id}/video`, { method: 'PUT', body: { url } }), message)
  return <section className="panel !p-0">
    <div className="border-b border-line px-6 py-5"><h2 className="text-lg font-semibold tracking-tight"><span className="mr-2 tabular-nums text-xs text-faint">13</span>Video tour <span className="ml-2 text-xs font-normal text-faint">Optional</span></h2><p className="mt-1 text-sm text-muted">Show students around with a short walkthrough video hosted on YouTube.</p></div>
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
  const updatePlan = next => change(current => ({ plan: { ...current.plan, ...next } }))
  const toggleFacility = item => change(current => ({ facilities: current.facilities.includes(item) ? current.facilities.filter(value => value !== item) : [...current.facilities, item] }))
  const problem = planProblem(form.plan)
  async function perform(action, message) {
    setBusy(true); setError(''); setNotice('')
    try { const result = await action(); if (result?.data) setHostel(result.data); setNotice(message); onSaved(); return result }
    catch (cause) { setError(cause.message); return null } finally { setBusy(false) }
  }
  async function save(event) {
    event.preventDefault()
    if (problem) { setError(problem); return }
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
        <Step number={1} title="Hostel name" htmlFor="listing-name"><input id="listing-name" className="input" required maxLength={150} value={form.name} onChange={update('name')} /></Step>
        <Step number={2} title="City" htmlFor="listing-city"><input id="listing-city" className="input" required maxLength={100} value={form.city} onChange={update('city')} placeholder="Lahore" /></Step>
        <Step number={3} title="Address" htmlFor="listing-address"><input id="listing-address" className="input" required maxLength={300} value={form.address} onChange={update('address')} placeholder="Street, area" /></Step>
        <Step number={4} title="Description" hint="Tell students what living here is like." htmlFor="listing-description"><textarea id="listing-description" className="input min-h-28" required maxLength={5000} value={form.description} onChange={update('description')} /></Step>
        <Step number={5} title="Floors and rooms" hint="Add each floor's rooms, how many seats each has and whether its bathroom is attached or shared. Leave free seats empty if the whole room is free. We draw your floor plan from this automatically."><FloorsEditor plan={form.plan} onChange={updatePlan} /></Step>
        <Step number={6} title="Pricing" hint="Students see your listing priced from the cheapest bed up to the dearest."><PricingEditor plan={form.plan} onChange={updatePlan} /></Step>
        <Step number={7} title="Who can stay?"><div role="radiogroup" aria-label="Residents" className="flex flex-wrap gap-2">{genderOptions.map(([value, label]) => <label key={value} className={`btn min-h-10 cursor-pointer px-4 ${form.gender === value ? 'btn-primary' : 'btn-secondary'}`}><input type="radio" name="gender" value={value} checked={form.gender === value} onChange={update('gender')} className="sr-only" />{label}</label>)}</div></Step>
        <Step number={8} title="Facilities">
          <div className="grid gap-2 sm:grid-cols-3">{facilityOptions.map(item => <label key={item} className="flex min-h-10 cursor-pointer items-center gap-2.5 rounded-lg border border-line px-3 text-sm"><input type="checkbox" checked={form.facilities.includes(item)} onChange={() => toggleFacility(item)} />{item}</label>)}</div>
          <Field label="Other facilities (comma separated)"><input className="input" maxLength={500} value={form.otherFacilities} onChange={update('otherFacilities')} placeholder="Gym, Rooftop" /></Field>
        </Step>
        <Step number={9} title="Meals" htmlFor="listing-meals"><select id="listing-meals" className="input max-w-64" required value={form.mealsPerDay} onChange={update('mealsPerDay')}><option value="" disabled>Choose…</option>{mealOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Step>
        <Step number={10} title="Nearby universities" hint="Separate them with commas." htmlFor="listing-universities"><input id="listing-universities" className="input" maxLength={1000} value={form.universities} onChange={update('universities')} placeholder="University of the Punjab, UCP, FAST" /></Step>
      </fieldset>
      <div className="flex flex-wrap items-center justify-between gap-4 border-t border-line px-6 py-4"><p className="max-w-md text-xs leading-5 text-muted">Editing an approved listing returns it to draft and removes it from public search until it is approved again.</p><Button disabled={busy || suspended}>{busy ? 'Please wait…' : hostel ? 'Save changes' : 'Save and continue'}</Button></div>
    </form>
    {hostel && <section className="panel !p-0">
      <div className="border-b border-line px-6 py-5"><h2 className="text-lg font-semibold tracking-tight"><span className="mr-2 tabular-nums text-xs text-faint">11</span>Room photos</h2><p className="mt-1 text-sm text-muted">Upload at least one photo of each room size you have. JPEG, PNG or WebP · up to 5 MiB · 10 photos in total.</p>{dirty && <p className="mt-2 text-sm text-limited">Save your changes before managing photos.</p>}</div>
      {savedTypes.length ? savedTypes.map(type => { const photos = hostel.images.filter(image => image.seats === type.seats); return <div key={type.seats} className="border-b border-line px-6 py-5 last:border-b-0"><div className="flex flex-wrap items-center justify-between gap-3"><h3 className="font-semibold">{seaterLabel(type.seats)} rooms <span className={`ml-2 text-xs font-normal ${photos.length ? 'text-open' : 'text-limited'}`}>{photos.length ? `${photos.length} photo${photos.length > 1 ? 's' : ''}` : 'Photo needed'}</span></h3><label className={`btn btn-secondary ${locked ? 'pointer-events-none opacity-50' : 'cursor-pointer'}`}><ImagePlus size={16} aria-hidden="true" />Add {seaterLabel(type.seats)} photo<input aria-label={`Upload ${seaterLabel(type.seats)} room photos`} type="file" multiple accept="image/jpeg,image/png,image/webp" disabled={locked} onChange={event => upload(event, type.seats)} className="sr-only" /></label></div>{photos.length > 0 && <div className="mt-4 grid gap-3 sm:grid-cols-3 lg:grid-cols-4">{photos.map(photoTile)}</div>}</div> }) : <div className="px-6 py-5"><Empty>Save your floors and rooms first.</Empty></div>}
      {otherPhotos.length > 0 && <div className="border-t border-line px-6 py-5"><h3 className="font-semibold">Other photos</h3><div className="mt-4 grid gap-3 sm:grid-cols-3 lg:grid-cols-4">{otherPhotos.map(photoTile)}</div></div>}
    </section>}
    {hostel?.rooms?.length > 0 && <PlanPreview hostel={hostel} dirty={dirty} />}
    {hostel && <VideoTour hostel={hostel} locked={locked} perform={perform} />}
    {hostel && <section className="panel flex flex-wrap items-center justify-between gap-4"><div><h2 className="text-lg font-semibold tracking-tight">Review</h2><p className="mt-1 text-sm text-muted">{dirty ? 'Save your changes before submitting.' : missingPhotos.length ? `Add a photo of your ${missingPhotos.map(type => seaterLabel(type.seats)).join(', ')} room${missingPhotos.length > 1 ? 's' : ''} to submit.` : 'An administrator checks every listing before students can see it.'}</p></div><button className="btn btn-accent" disabled={locked || !hostel.images.length || missingPhotos.length > 0 || !['DRAFT', 'REJECTED'].includes(hostel.status)} onClick={() => perform(() => api(`/hostels/${hostel._id}/submit`, { method: 'POST' }), 'Submitted for administrator review.')}>Submit for review</button></section>}
    {hostel && <section className="rounded-2xl border border-dashed border-line-strong p-6"><div className="flex flex-wrap items-center justify-between gap-4"><div><h2 className="font-semibold">Delete listing</h2><p className="mt-1 text-sm text-muted">Removes it from your account and public search. Conversations stay available.</p></div><Button secondary disabled={busy} onClick={() => setConfirmDelete(true)}><Trash2 size={16} aria-hidden="true" />Delete listing</Button></div>{confirmDelete && <div className="fade mt-4 flex flex-wrap items-center gap-3 rounded-xl border border-line bg-raised p-4"><p className="mr-auto text-sm text-danger">Remove this listing from your account and public search?</p><Button disabled={busy} onClick={async () => { setBusy(true); setError(''); try { await api(`/hostels/${hostel._id}`, { method: 'DELETE' }); onClose() } catch (cause) { setError(cause.message); setBusy(false) } }}>Confirm deletion</Button><Button secondary disabled={busy} onClick={() => setConfirmDelete(false)}>Cancel</Button></div>}</section>}
  </div>
}
