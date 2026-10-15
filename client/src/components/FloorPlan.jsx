import { useState } from 'react'
import { availability, availabilityText, formatPrice, seatLabel } from '../lib/rooms'

// Blueprint palette. Colours that must be told apart also differ in lightness.
const C = { floor: '#111a21', corridor: '#0d151b', wall: '#c4d0d9', wallSoft: '#6f808e', label: '#e8eef2', dim: '#7f909d', grid: '#16222b', open: '#4fd1a1', limited: '#f2a65a', full: '#55636f', bedTaken: '#2b3741' }
const tone = { open: C.open, limited: C.limited, full: C.full }
const PAD = 9
const EXT = 1.1, INT = 0.5

const near = (a, b) => Math.abs(a - b) < 0.6
const overlaps = (a0, a1, b0, b1) => Math.min(a1, b1) - Math.max(a0, b0) > 1

// Which wall of a space opens onto a corridor; falls back to the side facing the building's middle.
function doorSide(item, corridors, height) {
  for (const c of corridors) {
    if (near(item.y + item.h, c.y) && overlaps(item.x, item.x + item.w, c.x, c.x + c.w)) return 'bottom'
    if (near(item.y, c.y + c.h) && overlaps(item.x, item.x + item.w, c.x, c.x + c.w)) return 'top'
    if (near(item.x + item.w, c.x) && overlaps(item.y, item.y + item.h, c.y, c.y + c.h)) return 'right'
    if (near(item.x, c.x + c.w) && overlaps(item.y, item.y + item.h, c.y, c.y + c.h)) return 'left'
  }
  return item.y + item.h / 2 < height / 2 ? 'bottom' : 'top'
}

// Walls as segments, with a gap and a swing arc where the door is.
function Walls({ item, side, door = true }) {
  const { x, y, w, h } = item
  const edges = { top: [x, y, x + w, y], bottom: [x, y + h, x + w, y + h], left: [x, y, x, y + h], right: [x + w, y, x + w, y + h] }
  const parts = []
  for (const [name, [x1, y1, x2, y2]] of Object.entries(edges)) {
    if (name !== side || !door) { if (name !== side || door) parts.push(<line key={name} x1={x1} y1={y1} x2={x2} y2={y2} stroke={C.wall} strokeWidth={INT} strokeLinecap="square" />); continue }
    const horizontal = y1 === y2
    const length = horizontal ? w : h
    const d = Math.min(4, length * 0.32)
    const start = (horizontal ? x2 : y2) - 1.4 - d
    if (horizontal) {
      parts.push(<line key={`${name}a`} x1={x1} y1={y1} x2={start} y2={y1} stroke={C.wall} strokeWidth={INT} strokeLinecap="square" />, <line key={`${name}b`} x1={start + d} y1={y1} x2={x2} y2={y1} stroke={C.wall} strokeWidth={INT} strokeLinecap="square" />)
      const into = name === 'bottom' ? -1 : 1
      parts.push(<path key={`${name}d`} d={`M${start} ${y1} A${d} ${d} 0 0 ${into < 0 ? 1 : 0} ${start + d} ${y1 + into * d} L${start + d} ${y1}`} fill="none" stroke={C.wallSoft} strokeWidth={0.2} />)
    } else {
      parts.push(<line key={`${name}a`} x1={x1} y1={y1} x2={x1} y2={start} stroke={C.wall} strokeWidth={INT} strokeLinecap="square" />, <line key={`${name}b`} x1={x1} y1={start + d} x2={x1} y2={y2} stroke={C.wall} strokeWidth={INT} strokeLinecap="square" />)
      const into = name === 'right' ? -1 : 1
      parts.push(<path key={`${name}d`} d={`M${x1} ${start} A${d} ${d} 0 0 ${into < 0 ? 0 : 1} ${x1 + into * d} ${start + d} L${x1} ${start + d}`} fill="none" stroke={C.wallSoft} strokeWidth={0.2} />)
    }
  }
  return <g>{parts}</g>
}

function Windows({ item, width, height }) {
  const { x, y, w, h } = item
  const out = []
  const pane = (key, x1, y1, x2, y2) => {
    const horizontal = y1 === y2, o = 0.32
    const shift = (dx, dy) => ({ x1: x1 + dx, y1: y1 + dy, x2: x2 + dx, y2: y2 + dy })
    out.push(<g key={key}><line x1={x1} y1={y1} x2={x2} y2={y2} stroke="#0e1317" strokeWidth={EXT + 0.15} />
      <line {...shift(horizontal ? 0 : -o, horizontal ? -o : 0)} stroke={C.wall} strokeWidth={0.16} />
      <line {...shift(horizontal ? 0 : o, horizontal ? o : 0)} stroke={C.wall} strokeWidth={0.16} />
      <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="#7fb4d6" strokeWidth={0.14} /></g>)
  }
  if (near(y, 0)) pane('t', x + w * 0.3, 0, x + w * 0.7, 0)
  if (near(y + h, height)) pane('b', x + w * 0.3, height, x + w * 0.7, height)
  if (near(x, 0)) pane('l', 0, y + h * 0.3, 0, y + h * 0.7)
  if (near(x + w, width)) pane('r', width, y + h * 0.3, width, y + h * 0.7)
  return out
}

// One bed per seat, headboard against the wall opposite the door.
function Beds({ room, side, state }) {
  const inset = 1.3, gap = 1.1, bw = 3.8
  const n = room.seats
  const cols = Math.max(1, Math.min(n, Math.floor((room.w - inset * 2 + gap) / (bw + gap))))
  const rows = Math.ceil(n / cols)
  const bl = Math.min(7, (room.h - inset * 2 - 6.5 - (rows - 1) * gap) / rows)
  const fromBottom = side === 'top'
  const taken = n - room.available
  const color = tone[state]
  return Array.from({ length: n }, (_, index) => {
    const row = Math.floor(index / cols), col = index % cols
    const inRow = Math.min(cols, n - row * cols)
    const rowWidth = inRow * bw + (inRow - 1) * gap
    const bx = room.x + (room.w - rowWidth) / 2 + col * (bw + gap)
    const by = fromBottom ? room.y + room.h - inset - (row + 1) * bl - row * gap : room.y + inset + row * (bl + gap)
    const occupied = index < taken
    const pillowY = fromBottom ? by + bl - 1.7 : by + 0.4
    const foldY = fromBottom ? by + bl * 0.42 : by + bl * 0.58
    return <g key={index}>
      <rect x={bx} y={by} width={bw} height={bl} rx={0.35} fill={occupied ? C.bedTaken : `${color}1f`} stroke={occupied ? '#46545f' : color} strokeWidth={0.25} />
      <rect x={bx + 0.45} y={pillowY} width={bw - 0.9} height={1.3} rx={0.3} fill={occupied ? '#3a4752' : 'none'} stroke={occupied ? '#55636f' : color} strokeWidth={0.2} />
      <line x1={bx + 0.25} y1={foldY} x2={bx + bw - 0.25} y2={foldY} stroke={occupied ? '#46545f' : color} strokeWidth={0.18} opacity=".8" />
    </g>
  })
}

function AreaFurniture({ area }) {
  const { x, y, w, h, kind } = area
  const cx = x + w / 2, cy = y + h / 2
  const s = { fill: 'none', stroke: C.wallSoft, strokeWidth: 0.22 }
  if (kind === 'STAIRS') {
    const vertical = h >= w
    const steps = Math.floor((vertical ? h : w) / 1.6)
    return <g>{Array.from({ length: steps - 1 }, (_, i) => vertical ? <line key={i} x1={x + 0.6} x2={x + w - 0.6} y1={y + (i + 1) * 1.6} y2={y + (i + 1) * 1.6} {...s} /> : <line key={i} y1={y + 0.6} y2={y + h - 0.6} x1={x + (i + 1) * 1.6} x2={x + (i + 1) * 1.6} {...s} />)}
      {vertical && <path d={`M${cx} ${y + h - 2} L${cx} ${y + 2.5} M${cx - 1} ${y + 3.6} L${cx} ${y + 2.4} L${cx + 1} ${y + 3.6}`} fill="none" stroke={C.dim} strokeWidth={0.3} />}</g>
  }
  if (kind === 'BATH') return <g><rect x={x} y={y} width={w} height={h} fill="url(#tiles)" />{[0, 1].map(i => <g key={i}><rect x={x + 1.2 + i * 4} y={y + 1.2} width={2.6} height={1.2} rx={0.3} {...s} /><ellipse cx={x + 2.5 + i * 4} cy={y + 3.6} rx={1.2} ry={1.5} {...s} /></g>)}<rect x={x + w - 3} y={y + h - 9} width={1.8} height={6} rx={0.4} {...s} /></g>
  if (kind === 'KITCHEN') return <g><path d={`M${x + 1} ${y + 1} H${x + w - 1} V${y + 4} H${x + 4} V${y + h - 6} H${x + 1} Z`} {...s} /><circle cx={x + w * 0.45} cy={y + 2.5} r={0.9} {...s} />{[0, 1].map(i => <circle key={i} cx={x + w - 4 - i * 2.6} cy={y + 2.5} r={0.8} {...s} />)}<rect x={cx - 3} y={cy + 1} width={6} height={4} rx={0.4} {...s} /></g>
  if (kind === 'COMMON') return <g><path d={`M${cx - 7} ${cy - 4} V${cy + 3} H${cx + 7} V${cy - 4}`} {...s} strokeWidth={0.9} stroke="#2c3a45" /><rect x={cx - 3.5} y={cy - 2.5} width={7} height={3} rx={0.5} {...s} /><rect x={x + 1.5} y={y + 1.5} width={w - 3} height={h - 3} rx={0.6} fill="none" stroke="#1d2932" strokeWidth={0.2} strokeDasharray="0.6 0.6" /></g>
  if (kind === 'STUDY') return <g>{Array.from({ length: Math.max(1, Math.floor((w - 2) / 6)) }, (_, i) => [0, 1].map(r => <g key={`${i}-${r}`}><rect x={x + 1.5 + i * 6} y={y + 2 + r * 8} width={4.6} height={2.2} {...s} /><circle cx={x + 3.8 + i * 6} cy={y + 5.4 + r * 8} r={0.8} {...s} /></g>))}</g>
  return null
}

export function FloorPlan({ rooms, areas, selected, onSelect }) {
  const [hovered, setHovered] = useState('')
  const items = [...rooms, ...areas]
  const width = Math.max(...items.map(item => item.x + item.w))
  const height = Math.max(...items.map(item => item.y + item.h))
  const corridors = areas.filter(area => area.kind === 'CORRIDOR')
  const vw = width + PAD * 2, vh = height + PAD * 2
  const pct = (value, total) => `${((value + PAD) / total) * 100}%`
  const size = (value, total) => `${(value / total) * 100}%`
  const focus = rooms.find(room => room.code === (hovered || selected))
  const tip = rooms.find(room => room.code === hovered)
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
  return <div className="relative select-none" style={{ aspectRatio: `${vw} / ${vh}` }}>
    <svg viewBox={`${-PAD} ${-PAD} ${vw} ${vh}`} className="absolute inset-0 h-full w-full" aria-hidden="true" fontFamily="'Geist Mono', ui-monospace, monospace">
      <defs>
        <pattern id="bp-grid" width="2.5" height="2.5" patternUnits="userSpaceOnUse"><path d="M2.5 0H0V2.5" fill="none" stroke={C.grid} strokeWidth="0.12" /></pattern>
        <pattern id="bp-grid-major" width="10" height="10" patternUnits="userSpaceOnUse"><path d="M10 0H0V10" fill="none" stroke="#1d2b35" strokeWidth="0.18" /></pattern>
        <pattern id="tiles" width="1.6" height="1.6" patternUnits="userSpaceOnUse"><path d="M1.6 0H0V1.6" fill="none" stroke="#1e2c36" strokeWidth="0.1" /></pattern>
        <pattern id="hatch" width="1.4" height="1.4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="1.4" stroke="#2a3640" strokeWidth="0.35" /></pattern>
      </defs>
      <rect x={-PAD} y={-PAD} width={vw} height={vh} fill="url(#bp-grid)" />
      <rect x={-PAD} y={-PAD} width={vw} height={vh} fill="url(#bp-grid-major)" />
      {Array.from({ length: Math.ceil(width / 10) }, (_, i) => <g key={`c${i}`} fill={C.dim} fontSize="1.5" textAnchor="middle"><text x={i * 10 + 5} y={-PAD / 2 + 0.5}>{letters[i]}</text><line x1={i * 10} x2={i * 10} y1={-2.6} y2={-1.6} stroke={C.wallSoft} strokeWidth="0.15" /></g>)}
      {Array.from({ length: Math.ceil(height / 10) }, (_, i) => <g key={`r${i}`} fill={C.dim} fontSize="1.5" textAnchor="middle"><text x={-PAD / 2} y={i * 10 + 5.5}>{i + 1}</text><line y1={i * 10} y2={i * 10} x1={-2.6} x2={-1.6} stroke={C.wallSoft} strokeWidth="0.15" /></g>)}
      <g transform={`translate(${width + PAD / 2} ${-PAD / 2 + 0.4})`}><circle r="2.4" fill="none" stroke={C.wallSoft} strokeWidth="0.15" /><path d="M0 -1.8 L0.8 0.6 L0 0.1 L-0.8 0.6 Z" fill={C.label} /><text y="-2.9" fontSize="1.3" fill={C.dim} textAnchor="middle">N</text></g>

      <rect x={0} y={0} width={width} height={height} fill={C.corridor} />
      {areas.map(area => <g key={`a-${area.label}-${area.x}-${area.y}`}>
        <rect x={area.x} y={area.y} width={area.w} height={area.h} fill={area.kind === 'CORRIDOR' ? C.corridor : C.floor} />
        <AreaFurniture area={area} />
      </g>)}
      {rooms.map(room => {
        const state = availability(room)
        const active = room.code === selected, hot = room.code === hovered
        return <g key={`f-${room.code}`}>
          <rect x={room.x} y={room.y} width={room.w} height={room.h} fill={C.floor} />
          {state === 'full' ? <rect x={room.x} y={room.y} width={room.w} height={room.h} fill="url(#hatch)" /> : <rect className="plan-room" x={room.x} y={room.y} width={room.w} height={room.h} fill={tone[state]} opacity={active ? 0.13 : hot ? 0.11 : 0.06} />}
          {active && <rect x={room.x + 0.55} y={room.y + 0.55} width={room.w - 1.1} height={room.h - 1.1} fill="none" stroke="#ffffff" strokeWidth={0.22} opacity=".55" />}
        </g>
      })}
      {areas.filter(area => area.kind !== 'CORRIDOR').map(area => <Walls key={`w-${area.label}-${area.x}-${area.y}`} item={area} side={doorSide(area, corridors, height)} door={area.kind !== 'STAIRS'} />)}
      {rooms.map(room => {
        const side = doorSide(room, corridors, height)
        const state = availability(room)
        const top = side === 'top'
        const labelY = top ? room.y + 4 : room.y + room.h - 3.9
        const color = tone[state]
        return <g key={`r-${room.code}`}>
          <Beds room={room} side={side} state={state} />
          <Walls item={room} side={side} />
          <text x={room.x + 1.4} y={labelY} fontSize="2.5" fontWeight="600" fill={C.label}>{room.code}</text>
          <text x={room.x + 1.4} y={labelY + 2.1} fontSize="1.25" letterSpacing="0.12" fill={color === C.full ? C.dim : color}>{`${room.available}/${room.seats} FREE`}</text>
        </g>
      })}
      {areas.filter(area => area.kind !== 'CORRIDOR').map(area => {
        const ly = area.y + area.h / 2 + (area.kind === 'COMMON' ? 6.8 : area.kind === 'STUDY' ? 7.5 : 0.5)
        const lw = area.label.length * 1.05 + 1.6
        return <g key={`l-${area.label}-${area.x}`}><rect x={area.x + area.w / 2 - lw / 2} y={ly - 1.45} width={lw} height={2.1} rx={0.3} fill={C.floor} /><text x={area.x + area.w / 2} y={ly} fontSize="1.3" letterSpacing="0.25" textAnchor="middle" fill={C.dim}>{area.label.toUpperCase()}</text></g>
      })}
      {corridors.map(c => <text key={`c-${c.x}-${c.y}`} x={c.x + c.w / 2} y={c.y + c.h / 2 + 0.5} fontSize="1.3" letterSpacing="0.6" textAnchor="middle" fill="#4a5a67">{c.label.toUpperCase()}</text>)}
      <rect x={0} y={0} width={width} height={height} fill="none" stroke={C.wall} strokeWidth={EXT} />
      {rooms.flatMap(room => Windows({ item: room, width, height }).map(node => <g key={`win-${room.code}-${node.key}`}>{node}</g>))}
      {focus && <g className={focus.code === selected ? 'plan-pulse' : ''} stroke={focus.code === selected ? '#ffffff' : C.label} strokeWidth="0.4" fill="none" opacity={focus.code === selected ? 1 : 0.6}>
        {[[focus.x - 1, focus.y - 1, 1, 1], [focus.x + focus.w + 1, focus.y - 1, -1, 1], [focus.x - 1, focus.y + focus.h + 1, 1, -1], [focus.x + focus.w + 1, focus.y + focus.h + 1, -1, -1]].map(([bx, by, dx, dy], i) => <path key={i} d={`M${bx + dx * 3} ${by} H${bx} V${by + dy * 3}`} />)}
      </g>}
    </svg>
    {rooms.map(room => <button key={room.code} type="button" onClick={() => onSelect(room.code)} aria-pressed={room.code === selected}
      onMouseEnter={() => setHovered(room.code)} onMouseLeave={() => setHovered('')} onFocus={() => setHovered(room.code)} onBlur={() => setHovered('')}
      aria-label={`Room ${room.code}, ${seatLabel(room.seats)}, ${room.available} of ${room.seats} seats free, ${formatPrice(room.price)} per seat per month`}
      style={{ left: pct(room.x, vw), top: pct(room.y, vh), width: size(room.w, vw), height: size(room.h, vh) }}
      className="absolute cursor-pointer bg-transparent outline-offset-[-2px] focus-visible:outline-2 focus-visible:outline-white" />)}
    {tip && tip.code !== selected && <div role="presentation" className="fade pointer-events-none absolute z-20 w-max -translate-x-1/2 -translate-y-full rounded-lg border border-[#2a3843] bg-[#0b1116]/95 px-3 py-2 shadow-xl backdrop-blur" style={{ left: pct(tip.x + tip.w / 2, vw), top: `calc(${pct(tip.y, vh)} - 8px)` }}>
      <p className="font-mono text-[12px] font-semibold text-plan-text">Room {tip.code} · {seatLabel(tip.seats)}</p>
      <p className="mt-0.5 font-mono text-[11px] text-[#9aa7b2]"><span style={{ color: tone[availability(tip)] === C.full ? undefined : tone[availability(tip)] }}>{availabilityText[availability(tip)]}</span> · {formatPrice(tip.price)}/seat</p>
    </div>}
  </div>
}

export function PlanLegend() {
  const bed = (fill, stroke) => <svg width="10" height="16" viewBox="0 0 10 16" aria-hidden="true"><rect x="1" y="1" width="8" height="14" rx="1" fill={fill} stroke={stroke} strokeWidth="1.2" /><rect x="2.5" y="2.5" width="5" height="3" rx=".6" fill="none" stroke={stroke} strokeWidth="1" /></svg>
  return <ul className="flex flex-wrap items-center gap-x-5 gap-y-2 font-mono text-[11px] uppercase tracking-wider text-[#9aa7b2]">
    <li className="flex items-center gap-2">{bed('rgba(79,209,161,.15)', C.open)}Free bed</li>
    <li className="flex items-center gap-2">{bed('rgba(242,166,90,.15)', C.limited)}Last bed</li>
    <li className="flex items-center gap-2">{bed(C.bedTaken, '#55636f')}Taken</li>
    <li className="flex items-center gap-2"><span className="h-3.5 w-3.5 border border-[#3a4752] bg-[repeating-linear-gradient(45deg,#2a3640_0_2px,transparent_2px_5px)]" />Full room</li>
  </ul>
}

export function FloorTabs({ floors, floor, onChange }) {
  return <div role="tablist" aria-label="Floors" className="inline-flex rounded-lg border border-plan-wall bg-black/20 p-1">{floors.map(value => <button key={value} role="tab" type="button" aria-selected={value === floor} onClick={() => onChange(value)} className={`min-h-9 rounded-md px-3 font-mono text-xs uppercase tracking-wider transition-colors ${value === floor ? 'bg-plan-text text-plan' : 'text-[#9aa7b2] hover:text-plan-text'}`}>{value === 0 ? 'Ground floor' : `Floor ${value}`}</button>)}</div>
}
