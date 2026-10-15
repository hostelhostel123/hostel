export const formatPrice = value => `PKR ${Number(value || 0).toLocaleString()}`
export const floorName = floor => floor === 0 ? 'Ground floor' : `Floor ${floor}`
export const seatLabel = seats => seats === 1 ? 'Single' : `${seats}-seater`

export function availability(room) {
  if (!room.available) return 'full'
  return room.available === 1 && room.seats > 1 ? 'limited' : 'open'
}
export const availabilityText = { open: 'Available', limited: 'Last seat', full: 'Full' }

export const hasPlan = hostel => Array.isArray(hostel?.rooms) && hostel.rooms.length > 0

export function floorsOf(hostel) {
  const floors = new Set([...(hostel.rooms || []), ...(hostel.areas || [])].map(item => item.floor || 0))
  return [...floors].sort((a, b) => a - b)
}

// Groups rooms by capacity so a results card can say "2-seater · 3 seats free · from PKR 28,500".
export function roomTypes(hostel) {
  const groups = new Map()
  for (const room of hostel.rooms || []) {
    const group = groups.get(room.seats) || { seats: room.seats, rooms: 0, free: 0, minPrice: Infinity }
    group.rooms += 1
    group.free += room.available
    group.minPrice = Math.min(group.minPrice, room.price)
    group.maxPrice = Math.max(group.maxPrice ?? 0, room.priceMax ?? room.price)
    groups.set(room.seats, group)
  }
  return [...groups.values()].sort((a, b) => a.seats - b.seats)
}
export function freeSeats(hostel) { return hasPlan(hostel) ? hostel.rooms.reduce((sum, room) => sum + room.available, 0) : hostel.beds }
export function lowestPrice(hostel) { return hasPlan(hostel) ? Math.min(...hostel.rooms.map(room => room.price)) : hostel.price }
export function highestPrice(hostel) {
  if (hostel.maxPrice) return hostel.maxPrice
  if (hasPlan(hostel)) return Math.max(...hostel.rooms.map(room => room.priceMax ?? room.price))
  if (hostel.seaterRooms?.length) return Math.max(...hostel.seaterRooms.map(type => type.pricePerBed))
  return hostel.price
}
// "PKR 15,000 – 33,000" when prices vary, otherwise a single price.
export const formatRange = (low, high) => high > low ? `${formatPrice(low)} – ${Number(high).toLocaleString()}` : formatPrice(low)
export const priceRange = hostel => formatRange(lowestPrice(hostel), highestPrice(hostel))
export const roomPriceRange = room => formatRange(room.price, room.priceMax ?? room.price)
export const bathLabel = bath => ({ ATTACHED: 'Attached bathroom', SHARED: 'Shared bathroom' })[bath]
