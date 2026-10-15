import { availability, availabilityText, floorName, formatPrice, seatLabel } from '../lib/rooms'

const roomTone = {
  open: 'border-[#5fd3a8]/70 bg-[#5fd3a8]/[.08] hover:bg-[#5fd3a8]/[.16]',
  limited: 'border-[#f0a85a]/80 bg-[#f0a85a]/[.08] hover:bg-[#f0a85a]/[.16]',
  full: 'border-plan-wall bg-[repeating-linear-gradient(135deg,transparent_0_6px,rgba(255,255,255,.05)_6px_7px)] hover:bg-white/[.04]',
}
const seatTone = { open: 'border-[#5fd3a8]', limited: 'border-[#f0a85a]', full: 'border-[#6b7884]' }
const seatFill = { open: 'bg-[#5fd3a8]', limited: 'bg-[#f0a85a]', full: 'bg-[#6b7884]' }
const areaTone = {
  CORRIDOR: 'border-transparent bg-white/[.02]',
  STAIRS: 'border-plan-wall bg-[repeating-linear-gradient(90deg,transparent_0_7px,rgba(255,255,255,.08)_7px_8px)]',
  BATH: 'border-plan-wall bg-[#6aa7d8]/[.06]',
}

const pct = (value, total) => `${(value / total) * 100}%`

// A top-down tactical plan of one floor. Rooms are real buttons laid over a blueprint grid.
export function FloorPlan({ rooms, areas, selected, onSelect }) {
  const items = [...rooms, ...areas]
  const width = Math.max(...items.map(item => item.x + item.w))
  const height = Math.max(...items.map(item => item.y + item.h))
  const box = item => ({ left: pct(item.x, width), top: pct(item.y, height), width: pct(item.w, width), height: pct(item.h, height) })
  return <div className="relative" style={{ aspectRatio: `${width} / ${height}` }}>
    {areas.map(area => <div key={`${area.label}-${area.x}-${area.y}`} style={box(area)} className={`absolute grid place-items-center border ${areaTone[area.kind] || 'border-plan-wall bg-white/[.03]'}`}><span className="px-1 text-center font-mono text-[10px] uppercase tracking-[.16em] text-[#8796a3]">{area.label}</span></div>)}
    {rooms.map(room => {
      const state = availability(room)
      const active = selected === room.code
      return <button key={room.code} type="button" style={box(room)} onClick={() => onSelect(room.code)} aria-pressed={active}
        aria-label={`Room ${room.code}, ${seatLabel(room.seats)}, ${room.available} of ${room.seats} seats free, ${formatPrice(room.price)} per seat per month`}
        className={`plan-room group absolute flex flex-col justify-between border-[1.5px] p-[clamp(4px,1.1vw,12px)] text-left outline-offset-[-3px] ${roomTone[state]} ${active ? '!border-white !bg-white/[.12] z-10' : ''}`}>
        {active && <span aria-hidden="true" className="plan-pulse pointer-events-none absolute -inset-[5px] border border-white/60" />}
        <span className="flex items-start justify-between gap-1">
          <span className="font-mono text-[clamp(11px,1.3vw,15px)] font-semibold tracking-tight text-plan-text">{room.code}</span>
          <span className="hidden font-mono text-[10px] uppercase tracking-wider text-[#8796a3] sm:inline">{availabilityText[state]}</span>
        </span>
        <span className="flex flex-wrap gap-[3px]" aria-hidden="true">{Array.from({ length: room.seats }, (_, index) => <span key={index} className={`h-[clamp(6px,.8vw,9px)] w-[clamp(6px,.8vw,9px)] rounded-full border ${seatTone[state]} ${index < room.seats - room.available ? seatFill[state] : ''}`} />)}</span>
      </button>
    })}
  </div>
}

export function PlanLegend() {
  return <ul className="flex flex-wrap gap-x-5 gap-y-2 font-mono text-[11px] uppercase tracking-wider text-[#9aa7b2]">
    <li className="flex items-center gap-2"><span className="h-3 w-3 border-[1.5px] border-[#5fd3a8] bg-[#5fd3a8]/15" />Available</li>
    <li className="flex items-center gap-2"><span className="h-3 w-3 border-[1.5px] border-[#f0a85a] bg-[#f0a85a]/15" />Last seat</li>
    <li className="flex items-center gap-2"><span className="h-3 w-3 border-[1.5px] border-[#6b7884]" />Full</li>
    <li className="flex items-center gap-2"><span className="h-2 w-2 rounded-full border border-[#9aa7b2]" />Free seat</li>
    <li className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-[#9aa7b2]" />Taken</li>
  </ul>
}

export function FloorTabs({ floors, floor, onChange }) {
  return <div role="tablist" aria-label="Floors" className="inline-flex rounded-lg border border-plan-wall bg-black/20 p-1">{floors.map(value => <button key={value} role="tab" type="button" aria-selected={value === floor} onClick={() => onChange(value)} className={`min-h-9 rounded-md px-3 font-mono text-xs uppercase tracking-wider transition-colors ${value === floor ? 'bg-plan-text text-plan' : 'text-[#9aa7b2] hover:text-plan-text'}`}>{floorName(value)}</button>)}</div>
}
