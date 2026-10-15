import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ArrowLeft, ArrowRight, BedDouble, Heart, MapPin, MessageCircle, SlidersHorizontal, Star, Users } from 'lucide-react'
import { api } from '../services/api'
import { useAuth } from '../context/AuthContext'
import { Button, Cover, Empty, ErrorNotice, Field, Loading, Page, Pagination, useResource } from '../components/ui'
import { FloorPlan, FloorTabs, PlanLegend } from '../components/FloorPlan'
import { availability, availabilityText, bathLabel, floorName, floorsOf, formatPrice, formatRange, freeSeats, hasPlan, highestPrice, lowestPrice, priceRange, roomPriceRange, roomTypes, seatLabel } from '../lib/rooms'

const residents = { MALE: 'Male residents', FEMALE: 'Female residents', ANY: 'All residents' }
const mealText = ['No meals', 'Meals once a day', 'Meals twice a day', 'Meals three times a day']
const hasSeaters = hostel => Array.isArray(hostel?.seaterRooms) && hostel.seaterRooms.length > 0
// Visitors are sent to sign in first and come back to this hostel; owners and admins don't message owners.
function MessageOwner({ hostelId, secondary = false }) {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  if (user && user.role !== 'STUDENT') return null
  async function start() {
    if (!user) { navigate('/login', { state: { from: `/hostels/${hostelId}` } }); return }
    setBusy(true); setError('')
    try { const chat = await api('/conversations', { method: 'POST', body: { hostelId } }); navigate(`/messages?conversation=${chat.data._id}`) }
    catch (cause) { setError(cause.message); setBusy(false) }
  }
  return <><Button secondary={secondary} disabled={busy} onClick={start}><MessageCircle size={16} aria-hidden="true" />{busy ? 'Opening…' : 'Message owner'}</Button>{error && <p role="alert" className="w-full text-sm text-danger">{error}</p>}</>
}
function SeaterRooms({ hostel }) {
  return <section className="mt-14"><h2 className="text-lg font-semibold tracking-tight">Rooms and prices</h2><p className="mt-1 text-sm text-muted">{hostel.totalRooms} rooms{hostel.floors ? ` across ${hostel.floors} floor${hostel.floors > 1 ? 's' : ''}` : ''}. Prices are for one bed per month.</p>
    <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{hostel.seaterRooms.map(type => { const photo = hostel.images.find(image => image.seats === type.seats); return <article key={type.seats} className="overflow-hidden rounded-2xl border border-line bg-surface">{photo ? <a href={photo.url} target="_blank" rel="noreferrer"><img src={photo.url} alt={`${seatLabel(type.seats)} room`} className="h-44 w-full object-cover" /></a> : <div className="grid h-44 place-items-center bg-raised text-sm text-faint">No photo</div>}<div className="p-4"><div className="flex items-baseline justify-between gap-3"><h3 className="font-semibold">{seatLabel(type.seats)} room</h3><p className="text-sm text-muted">{type.rooms} room{type.rooms > 1 ? 's' : ''}</p></div><p className="mt-2 text-lg font-semibold tabular-nums">{formatPrice(type.pricePerBed)}<span className="text-sm font-normal text-muted"> per bed</span></p></div></article> })}</div>
  </section>
}

function Favorite({ hostel, onChange, compact = false }) {
  const { user, setUser } = useAuth()
  const navigate = useNavigate()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const saved = user?.favoriteIds?.includes(hostel._id)
  if (user && user.role !== 'STUDENT') return null
  async function toggle() {
    if (!user) { navigate('/login', { state: { from: `/hostels/${hostel._id}` } }); return }
    setBusy(true); setError('')
    try { await api(`/hostels/${hostel._id}/favorite`, { method: saved ? 'DELETE' : 'POST' }); setUser(current => current && ({ ...current, favoriteIds: saved ? current.favoriteIds.filter(id => id !== hostel._id) : [...(current.favoriteIds || []), hostel._id] })); onChange?.() }
    catch (cause) { setError(cause.message) } finally { setBusy(false) }
  }
  return <div><Button secondary disabled={busy} onClick={toggle} aria-label={saved ? 'Remove from favorites' : 'Save to favorites'} className={compact ? '!px-3' : ''}><Heart size={16} aria-hidden="true" className={saved ? 'fill-current text-accent-ink' : ''} />{!compact && (saved ? 'Saved' : 'Save')}</Button><ErrorNotice>{error}</ErrorNotice></div>
}

function RoomSummary({ hostel }) {
  if (!hasPlan(hostel) && hasSeaters(hostel)) return <table className="w-full text-sm">
    <caption className="sr-only">Rooms at {hostel.name}</caption>
    <thead><tr className="text-left text-[11px] uppercase tracking-wider text-faint"><th scope="col" className="pb-2 font-medium">Room type</th><th scope="col" className="pb-2 font-medium">Rooms</th><th scope="col" className="pb-2 text-right font-medium">Per bed / month</th></tr></thead>
    <tbody>{hostel.seaterRooms.map(type => <tr key={type.seats} className="border-t border-line"><td className="py-2.5"><span className="flex items-center gap-2 font-medium"><Users size={14} aria-hidden="true" className="text-faint" />{seatLabel(type.seats)}</span></td><td className="py-2.5 text-muted">{type.rooms}</td><td className="py-2.5 text-right font-medium tabular-nums">{formatPrice(type.pricePerBed)}</td></tr>)}</tbody>
  </table>
  if (!hasPlan(hostel)) return <div className="rounded-xl bg-ground px-4 py-3 text-sm text-muted"><span className="font-medium text-ink">{hostel.beds} beds</span> available · room-by-room plan not published yet</div>
  return <table className="w-full text-sm">
    <caption className="sr-only">Rooms at {hostel.name}</caption>
    <thead><tr className="text-left text-[11px] uppercase tracking-wider text-faint"><th scope="col" className="pb-2 font-medium">Room type</th><th scope="col" className="pb-2 font-medium">Free seats</th><th scope="col" className="pb-2 text-right font-medium">Per seat / month</th></tr></thead>
    <tbody>{roomTypes(hostel).map(group => <tr key={group.seats} className="border-t border-line">
      <td className="py-2.5"><span className="flex items-center gap-2 font-medium"><Users size={14} aria-hidden="true" className="text-faint" />{seatLabel(group.seats)}<span className="font-normal text-faint">· {group.rooms} {group.rooms === 1 ? 'room' : 'rooms'}</span></span></td>
      <td className="py-2.5">{group.free ? <span className="font-medium text-open">{group.free} free</span> : <span className="text-faint">Full</span>}</td>
      <td className="py-2.5 text-right font-medium tabular-nums">{formatRange(group.minPrice, group.maxPrice)}</td>
    </tr>)}</tbody>
  </table>
}

export function HostelCard({ hostel, onChange }) {
  const seats = freeSeats(hostel)
  return <article className="lift grid overflow-hidden rounded-2xl border border-line bg-surface md:grid-cols-[300px_1fr]">
    <Link to={`/hostels/${hostel._id}`} tabIndex={-1} aria-hidden="true" className="block p-2 md:p-3"><Cover hostel={hostel} className="h-56 w-full md:h-full md:min-h-[230px]" /></Link>
    <div className="flex min-w-0 flex-col gap-5 p-5 md:p-6 md:pl-3">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0"><h2 className="text-xl font-semibold tracking-tight"><Link to={`/hostels/${hostel._id}`} className="hover:text-accent-ink">{hostel.name}</Link></h2><p className="mt-1.5 flex items-center gap-1.5 text-sm text-muted"><MapPin size={14} aria-hidden="true" />{hostel.address}, {hostel.city}</p></div>
        <div className="text-right"><p className="text-[11px] uppercase tracking-wider text-faint">{highestPrice(hostel) > lowestPrice(hostel) ? 'Price range' : 'From'}</p><p className="text-xl font-semibold tabular-nums tracking-tight">{priceRange(hostel)}</p><p className="text-xs text-muted">{hasSeaters(hostel) ? 'per bed / month' : 'per month'}</p></div>
      </div>
      <div className="flex flex-wrap gap-2">{hostel.featured && <span className="chip !bg-accent-soft !text-accent-ink"><Star size={13} aria-hidden="true" />Featured</span>}<span className="chip">{residents[hostel.gender] || residents.ANY}</span>{hasSeaters(hostel) ? <span className="chip !bg-accent-soft !text-accent-ink"><BedDouble size={13} aria-hidden="true" />{hostel.seaterRooms.map(type => seatLabel(type.seats)).join(' · ')}</span> : <span className={`chip ${seats ? '!bg-accent-soft !text-accent-ink' : ''}`}><BedDouble size={13} aria-hidden="true" />{seats ? `${seats} ${seats === 1 ? 'seat' : 'seats'} free` : 'Fully occupied'}</span>}{hostel.mealsPerDay > 0 && <span className="chip">{mealText[hostel.mealsPerDay]}</span>}{hostel.amenities.slice(0, 4).map(item => <span key={item} className="chip">{item}</span>)}</div>
      <RoomSummary hostel={hostel} />
      <div className="mt-auto flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4"><div className="flex flex-wrap items-center gap-2"><Favorite hostel={hostel} onChange={onChange} /><MessageOwner hostelId={hostel._id} secondary /></div><Link to={`/hostels/${hostel._id}`} className="btn btn-primary">{hasPlan(hostel) ? 'View floor plan' : 'View details'}<ArrowRight size={16} aria-hidden="true" /></Link></div>
    </div>
  </article>
}

export function Hostels({ favorites = false }) {
  const [params, setParams] = useSearchParams()
  const [filters, setFilters] = useState(() => Object.fromEntries(['q', 'city', 'minPrice', 'maxPrice', 'gender', 'sort'].map(key => [key, params.get(key) || ''])))
  const query = new URLSearchParams()
  for (const key of ['q', 'city', 'minPrice', 'maxPrice', 'gender', 'sort', 'page']) if (params.get(key)) query.set(key, params.get(key))
  if (favorites) { const page = query.get('page'); for (const key of [...query.keys()]) query.delete(key); if (page) query.set('page', page) }
  const list = useResource(`/${favorites ? 'favorites' : 'hostels'}?${query}`)
  const update = key => event => setFilters(current => ({ ...current, [key]: event.target.value }))
  function search(event) { event.preventDefault(); setParams(Object.fromEntries(Object.entries(filters).filter(([, value]) => value !== ''))) }
  return <Page eyebrow={favorites ? 'Your collection' : 'Explore hostels'} title={favorites ? 'Saved hostels.' : 'Find your next place.'} description={favorites ? 'Your saved, currently approved listings.' : 'Every approved hostel, with the rooms it has free and what each seat costs.'}>
    {!favorites && <form onSubmit={search} role="search" className="rise mb-10 rounded-2xl border border-line bg-surface p-4 sm:p-5">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_.8fr_.8fr_1fr]">
        <Field label="Search"><input className="input" placeholder="Name or area" value={filters.q} onChange={update('q')} maxLength={100} /></Field>
        <Field label="City"><input className="input" placeholder="Any city" value={filters.city} onChange={update('city')} maxLength={100} /></Field>
        <Field label="Residents"><select className="input" value={filters.gender} onChange={update('gender')}><option value="">All listings</option><option value="MALE">Male</option><option value="FEMALE">Female</option><option value="ANY">Any</option></select></Field>
        <Field label="Minimum monthly price"><input className="input" type="number" inputMode="numeric" placeholder="Min" min={0} max={10000000} value={filters.minPrice} onChange={update('minPrice')} /></Field>
        <Field label="Maximum monthly price"><input className="input" type="number" inputMode="numeric" placeholder="Max" min={filters.minPrice || 0} max={10000000} value={filters.maxPrice} onChange={update('maxPrice')} /></Field>
        <Field label="Sort"><select className="input" value={filters.sort} onChange={update('sort')}><option value="">Newest</option><option value="priceAsc">Price: low to high</option><option value="priceDesc">Price: high to low</option></select></Field>
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-end gap-3 border-t border-line pt-4"><Button secondary type="button" onClick={() => { setFilters({ q: '', city: '', minPrice: '', maxPrice: '', gender: '', sort: '' }); setParams({}) }}>Clear filters</Button><button className="btn btn-accent min-w-32"><SlidersHorizontal size={16} aria-hidden="true" />Search</button></div>
    </form>}
    <ErrorNotice retry={list.reload}>{list.error}</ErrorNotice>
    {list.loading ? <Loading /> : list.result && <>
      <p className="mb-5 text-sm text-muted"><span className="font-semibold text-ink">{list.result.pagination.total}</span> {list.result.pagination.total === 1 ? 'hostel' : 'hostels'}{!favorites && ' match your search'}</p>
      <div className="grid gap-5">{list.result.data.map((hostel, index) => <div key={hostel._id} className="rise" style={{ animationDelay: `${Math.min(index, 6) * 60}ms` }}><HostelCard hostel={hostel} onChange={favorites ? list.reload : undefined} /></div>)}</div>
      {!list.result.data.length && <Empty>{favorites ? 'No saved hostels yet. Browse listings to find your favorites.' : 'No matching hostels. Try changing your filters.'}</Empty>}
      <Pagination pagination={list.result.pagination} onChange={page => { const next = new URLSearchParams(params); next.set('page', page); setParams(next) }} />
    </>}
  </Page>
}

function RoomPanel({ hostel, room, onRequest, busy, error }) {
  const { user } = useAuth()
  if (!room) return <div className="flex h-full flex-col justify-center gap-3 p-6 text-plan-text"><p className="tabular-nums text-[11px] uppercase tracking-[.18em] text-plan-muted">No room selected</p><p className="text-lg font-medium leading-snug">Select a room on the plan to see its seats and price.</p><p className="text-sm leading-6 text-plan-muted">Green rooms have free seats. Amber rooms have one seat left.</p></div>
  const state = availability(room)
  const canRequest = room.available > 0 && (!user || user.role === 'STUDENT')
  return <div key={room.code} className="fade flex h-full flex-col gap-6 p-6 text-plan-text">
    <div><p className="tabular-nums text-[11px] uppercase tracking-[.18em] text-plan-muted">{floorName(room.floor || 0)} · {availabilityText[state]}</p><h3 className="mt-2 tabular-nums text-4xl font-semibold tracking-tight">Room {room.code}</h3></div>
    <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-plan-edge bg-plan-edge">
      {[['Room type', seatLabel(room.seats)], ['Capacity', `${room.seats} ${room.seats === 1 ? 'seat' : 'seats'}`], ['Free seats', room.available ? `${room.available} of ${room.seats}` : 'None'], ['Per seat / month', roomPriceRange(room)], ...(room.bath ? [['Bathroom', room.bath === 'ATTACHED' ? 'Attached' : 'Shared']] : [])].map(([label, value], index, all) => <div key={label} className={`bg-plan p-3.5 ${all.length % 2 && index === all.length - 1 ? 'col-span-2' : ''}`}><dt className="text-[11px] text-plan-muted">{label}</dt><dd className="mt-1 tabular-nums text-[15px] font-medium">{value}</dd></div>)}
    </dl>
    {room.seatPrices?.length > 1 && <div><p className="text-[11px] text-plan-muted">Price of each seat</p><ul className="mt-2 flex flex-wrap gap-2">{room.seatPrices.map((price, index) => <li key={index} className="rounded-lg border border-plan-edge px-3 py-1.5 text-sm tabular-nums">Seat {index + 1} · {formatPrice(price)}</li>)}</ul></div>}
    <div className="mt-auto grid gap-3">
      <button type="button" disabled={!canRequest || busy} onClick={onRequest} className="btn btn-accent min-h-12">{busy ? 'Sending request…' : room.available ? `Request room ${room.code}` : 'Room is full'}</button>
      <p className="text-xs leading-5 text-plan-muted">{user && user.role !== 'STUDENT' ? 'Room requests are available to student accounts.' : `This sends ${hostel.owner?.name || 'the owner'} a message about this room. Nothing is charged.`}</p>
      {error && <p role="alert" className="rounded-lg border border-plan-edge px-3 py-2 text-sm text-danger">{error}</p>}
    </div>
  </div>
}

function RoomPicker({ hostel }) {
  const { user } = useAuth()
  const navigate = useNavigate()
  const floors = useMemo(() => floorsOf(hostel), [hostel])
  const [floor, setFloor] = useState(() => (hostel.rooms.find(room => room.available) || hostel.rooms[0]).floor || 0)
  const [selected, setSelected] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const onFloor = item => (item.floor || 0) === floor
  const room = hostel.rooms.find(item => item.code === selected)
  function choose(code) { setSelected(code); setError('') }
  function changeFloor(value) { setFloor(value); setSelected(current => hostel.rooms.find(item => item.code === current && (item.floor || 0) === value) ? current : '') }
  async function request() {
    if (!user) { navigate('/login', { state: { from: `/hostels/${hostel._id}` } }); return }
    setBusy(true); setError('')
    try {
      const chat = await api('/conversations', { method: 'POST', body: { hostelId: hostel._id } })
      await api(`/conversations/${chat.data._id}/messages`, { method: 'POST', body: { text: `Hi, I'd like to request Room ${room.code} (${seatLabel(room.seats)}, ${floorName(room.floor || 0)}) at ${roomPriceRange(room)} per seat per month${room.bath ? `, ${bathLabel(room.bath).toLowerCase()}` : ''}. Is a seat still available?` } })
      navigate(`/messages?conversation=${chat.data._id}`)
    } catch (cause) { setError(cause.message); setBusy(false) }
  }
  return <section aria-labelledby="choose-room" className="mt-14">
    <div className="mb-5 flex flex-wrap items-end justify-between gap-4"><div><p className="eyebrow">Floor plan</p><h2 id="choose-room" className="section-title mt-2">Choose your room.</h2></div><p className="max-w-sm text-sm leading-6 text-muted">{freeSeats(hostel)} seats free across {hostel.rooms.length} rooms on {floors.length} {floors.length === 1 ? 'floor' : 'floors'}.</p></div>
    <div className="overflow-hidden rounded-[22px] bg-plan border border-plan-edge shadow-[0_30px_80px_-40px_rgba(43,36,32,.45)] lg:grid lg:grid-cols-[1fr_340px]">
      <div className="min-w-0 border-plan-edge lg:border-r">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-plan-edge px-5 py-4"><FloorTabs floors={floors} floor={floor} onChange={changeFloor} /><PlanLegend /></div>
        <div className="overflow-x-auto p-2 sm:p-4">
          <p className="mb-1 px-3 pt-2 tabular-nums text-[11px] uppercase tracking-wider text-plan-muted sm:hidden">Swipe to see the whole floor</p><div key={floor} className="fade relative min-w-[680px]">
            <FloorPlan rooms={hostel.rooms.filter(onFloor)} areas={(hostel.areas || []).filter(onFloor)} selected={selected} onSelect={choose} />
          </div>
        </div>
      </div>
      <div className="border-t border-plan-edge lg:border-t-0"><RoomPanel hostel={hostel} room={room} onRequest={request} busy={busy} error={error} /></div>
    </div>
    <details className="group mt-5 rounded-2xl border border-line bg-surface">
      <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between px-5 text-sm font-medium">All rooms as a list<ArrowRight size={16} aria-hidden="true" className="transition-transform group-open:rotate-90" /></summary>
      <div className="overflow-x-auto px-5 pb-4"><table className="w-full min-w-[520px] text-sm"><thead><tr className="text-left text-[11px] uppercase tracking-wider text-faint"><th scope="col" className="py-2 font-medium">Room</th><th scope="col" className="py-2 font-medium">Floor</th><th scope="col" className="py-2 font-medium">Type</th><th scope="col" className="py-2 font-medium">Bathroom</th><th scope="col" className="py-2 font-medium">Free seats</th><th scope="col" className="py-2 text-right font-medium">Per seat / month</th><th scope="col"><span className="sr-only">Action</span></th></tr></thead>
        <tbody>{hostel.rooms.map(item => <tr key={item.code} className="border-t border-line"><td className="py-2.5 tabular-nums font-medium">{item.code}</td><td>{floorName(item.floor || 0)}</td><td>{seatLabel(item.seats)}</td><td className="text-muted">{item.bath === 'ATTACHED' ? 'Attached' : item.bath === 'SHARED' ? 'Shared' : '—'}</td><td className={item.available ? 'text-open' : 'text-faint'}>{item.available ? `${item.available} of ${item.seats}` : 'Full'}</td><td className="text-right tabular-nums">{roomPriceRange(item)}</td><td className="text-right"><button type="button" className="px-2 py-1 text-sm font-medium text-accent-ink underline-offset-2 hover:underline" onClick={() => { changeFloor(item.floor || 0); choose(item.code); document.getElementById('choose-room')?.scrollIntoView({ behavior: 'smooth' }) }}>Show on plan</button></td></tr>)}</tbody></table></div>
    </details>
  </section>
}

export function HostelDetail() {
  const { id } = useParams()
  const { result, loading, error, reload } = useResource(`/hostels/${id}`)
  const hostel = result?.data
  const gallery = hostel ? [...hostel.images].sort((a, b) => (b.publicId === hostel.coverImage) - (a.publicId === hostel.coverImage)) : []
  return <main className="mx-auto max-w-[1240px] px-5 pb-24 pt-8 lg:px-8">
    <Link to="/hostels" className="inline-flex min-h-11 items-center gap-2 text-sm font-medium text-muted hover:text-ink"><ArrowLeft size={16} aria-hidden="true" />All hostels</Link>
    <ErrorNotice retry={reload}>{error}</ErrorNotice>{loading && <Loading />}
    {!loading && !hostel && !error && <h1 className="page-title mt-4">Hostel details</h1>}
    {hostel && <>
      <header className="rise mt-4 flex flex-wrap items-end justify-between gap-6">
        <div><p className="eyebrow">{residents[hostel.gender] || residents.ANY}</p><h1 className="page-title mt-3">{hostel.name}</h1><p className="mt-3 flex items-center gap-1.5 text-[15px] text-muted"><MapPin size={15} aria-hidden="true" />{hostel.address}, {hostel.city}</p></div>
        <Favorite hostel={hostel} />
      </header>
      <div className="rise mt-8 grid gap-3 [animation-delay:80ms] sm:grid-cols-4 sm:grid-rows-2">
        {gallery.length ? gallery.slice(0, 5).map((image, index) => <a key={image.publicId} href={image.url} target="_blank" rel="noreferrer" className={`group overflow-hidden rounded-xl ${index === 0 ? 'sm:col-span-2 sm:row-span-2' : 'hidden sm:block'}`}><img src={image.url} alt={`${hostel.name} photo ${index + 1}`} className={`w-full object-cover transition-transform duration-700 ease-out group-hover:scale-[1.03] motion-reduce:transition-none ${index === 0 ? 'h-72 sm:h-[420px]' : 'h-[204px]'}`} /></a>) : <Cover hostel={hostel} className="h-72 w-full sm:col-span-4" />}
      </div>
      <div className="mt-10 grid gap-10 lg:grid-cols-[1fr_360px]">
        <section><h2 className="text-lg font-semibold tracking-tight">About this hostel</h2><p className="mt-3 whitespace-pre-wrap text-[15px] leading-8 text-muted">{hostel.description}</p>{hostel.amenities.length > 0 && <><h2 className="mt-8 text-lg font-semibold tracking-tight">Amenities</h2><ul className="mt-4 flex flex-wrap gap-2">{hostel.amenities.map(item => <li key={item} className="chip border border-line !bg-surface !px-3.5 !py-2 !text-[13px]">{item}</li>)}</ul></>}{hostel.universities?.length > 0 && <><h2 className="mt-8 text-lg font-semibold tracking-tight">Nearby universities</h2><ul className="mt-4 flex flex-wrap gap-2">{hostel.universities.map(item => <li key={item} className="chip border border-line !bg-surface !px-3.5 !py-2 !text-[13px]">{item}</li>)}</ul></>}</section>
        <aside className="panel h-fit lg:sticky lg:top-24">
          <p className="text-[11px] uppercase tracking-wider text-faint">{highestPrice(hostel) > lowestPrice(hostel) ? 'Price range' : 'From'}</p>
          <p className="mt-1 text-[28px] font-semibold leading-tight tabular-nums tracking-tight">{priceRange(hostel)}<span className="block text-sm font-normal tracking-normal text-muted">{hasSeaters(hostel) ? ' per bed / month' : ' / month'}</span></p>
          <dl className="mt-6 grid gap-3 border-t border-line pt-5 text-sm">
            {hasSeaters(hostel) ? <><div className="flex justify-between gap-4"><dt className="text-muted">Rooms</dt><dd className="text-right font-medium">{hostel.seaterRooms.map(type => seatLabel(type.seats)).join(', ')}</dd></div>{hostel.floors && <div className="flex justify-between gap-4"><dt className="text-muted">Floors</dt><dd className="font-medium">{hostel.floors}</dd></div>}{hostel.mealsPerDay !== undefined && <div className="flex justify-between gap-4"><dt className="text-muted">Meals</dt><dd className="font-medium">{mealText[hostel.mealsPerDay]}</dd></div>}</> : <div className="flex justify-between gap-4"><dt className="text-muted">Free seats</dt><dd className="font-medium">{freeSeats(hostel)}</dd></div>}
            {hasPlan(hostel) && <div className="flex justify-between gap-4"><dt className="text-muted">Room types</dt><dd className="text-right font-medium">{roomTypes(hostel).map(group => group.seats).join(', ')} seats per room</dd></div>}
            <div className="flex justify-between gap-4"><dt className="text-muted">Residents</dt><dd className="font-medium">{residents[hostel.gender] || residents.ANY}</dd></div>
            <div className="flex justify-between gap-4"><dt className="text-muted">Managed by</dt><dd className="font-medium">{hostel.owner?.name || 'Hostel owner'}</dd></div>
          </dl>
          <div className="mt-6 grid gap-3">
            {hasPlan(hostel) && <a href="#choose-room" className="btn btn-accent">Choose a room</a>}
            <MessageOwner hostelId={hostel._id} secondary={hasPlan(hostel)} />
          </div>
        </aside>
      </div>
      {hasSeaters(hostel) && <SeaterRooms hostel={hostel} />}
      {hostel.youtubeId && <section className="mt-14"><h2 className="text-lg font-semibold tracking-tight">Video tour</h2><div className="mt-5 aspect-video w-full max-w-3xl overflow-hidden rounded-2xl border border-line bg-raised"><iframe className="h-full w-full" src={`https://www.youtube-nocookie.com/embed/${hostel.youtubeId}`} title={`${hostel.name} video tour`} loading="lazy" allow="accelerometer; encrypted-media; gyroscope; picture-in-picture" allowFullScreen /></div></section>}
      {hasPlan(hostel) ? <RoomPicker hostel={hostel} /> : !hasSeaters(hostel) && <section className="mt-14 rounded-2xl border border-dashed border-line-strong p-8 text-center"><p className="text-lg font-semibold tracking-tight">Floor plan coming soon</p><p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted">This owner hasn't published a room-by-room plan yet. {hostel.beds} beds are listed at {formatPrice(hostel.price)} a month. Message the owner to ask about specific rooms.</p></section>}
    </>}
  </main>
}
