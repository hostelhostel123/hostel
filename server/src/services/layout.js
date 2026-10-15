// Turns an owner's floors → rooms → seats description into priced rooms with an auto-generated floor plan.
// Plan units match the student floor-plan renderer: rooms sit in two rows either side of a corridor.

const ROW_DEPTH = 22, CORRIDOR = 10, STAIRS = 10, SHARED_BATH = 12, ENSUITE = 7, MIN_SPACE = 12;
const roomWidth = room => 12 + room.seats * 4 + (room.bath === 'ATTACHED' ? ENSUITE : 0);
export const roomCode = (floor, index) => `${floor === 0 ? 'G' : floor}${String(index + 1).padStart(2, '0')}`;

// Per-seat prices for one room under either pricing mode.
export function seatPricesFor(room, pricing) {
  if (pricing.mode === 'CUSTOM') return room.seatPrices.slice(0, room.seats);
  const rate = pricing.rates.find(item => item.seats === room.seats)?.price ?? 0;
  const extra = room.bath === 'ATTACHED' ? pricing.attachedBathExtra || 0 : 0;
  return Array.from({ length: room.seats }, () => rate + extra);
}

function layoutFloor(rooms, floor) {
  const hasSharedBath = rooms.some(room => room.bath !== 'ATTACHED');
  // Rooms keep their order: the top row fills left to right until it holds about half the floor's width,
  // then the rest continue along the bottom row after the stairs. The shared washroom closes the top row.
  const widths = rooms.map(roomWidth);
  const half = (widths.reduce((sum, w) => sum + w, 0) + STAIRS + (hasSharedBath ? SHARED_BATH : 0)) / 2;
  const top = [], bottom = [{ kind: 'STAIRS', label: 'Stairs', w: STAIRS }];
  let topWidth = hasSharedBath ? SHARED_BATH : 0;
  rooms.forEach((room, index) => {
    const w = widths[index];
    if (bottom.length === 1 && (top.length === 0 || topWidth + w / 2 <= half)) { top.push({ room, w }); topWidth += w } else bottom.push({ room, w });
  });
  if (hasSharedBath) top.push({ kind: 'BATH', label: 'Washroom', w: SHARED_BATH });
  const rowWidth = row => row.reduce((sum, item) => sum + item.w, 0);
  return { floor, rows: [top, bottom], width: Math.max(rowWidth(top), rowWidth(bottom)) };
}

export function buildLayout(floorPlan, pricing) {
  const floors = floorPlan.floors.map((entry, floor) => layoutFloor(entry.rooms.map((room, index) => ({ ...room, code: room.code || roomCode(floor, index), floor })), floor));
  const width = Math.max(...floors.map(item => item.width), 40);
  const rooms = [], areas = [];
  for (const { floor, rows } of floors) {
    areas.push({ floor, label: 'Corridor', kind: 'CORRIDOR', x: 0, y: ROW_DEPTH, w: width, h: CORRIDOR });
    rows.forEach((row, rowIndex) => {
      const y = rowIndex === 0 ? 0 : ROW_DEPTH + CORRIDOR;
      // A gap too narrow to be a usable space is absorbed by the row's last room or area.
      const gap = width - row.reduce((sum, item) => sum + item.w, 0);
      if (gap > 0 && gap < MIN_SPACE) row[row.length - 1].w += gap;
      let x = 0;
      for (const item of row) {
        if (item.room) {
          const seatPrices = seatPricesFor(item.room, pricing);
          rooms.push({
            code: item.room.code, floor, seats: item.room.seats, bath: item.room.bath,
            available: Math.min(item.room.available ?? item.room.seats, item.room.seats),
            price: Math.min(...seatPrices), priceMax: Math.max(...seatPrices),
            ...(pricing.mode === 'CUSTOM' && { seatPrices }),
            x, y, w: item.w, h: ROW_DEPTH,
          });
        } else areas.push({ floor, label: item.label, kind: item.kind, x, y, w: item.w, h: ROW_DEPTH });
        x += item.w;
      }
      // Whatever is left of a shorter row becomes shared space so every floor has the same footprint.
      if (width - x >= MIN_SPACE) areas.push({ floor, label: floor === 0 && rowIndex === 1 ? 'Common room' : 'Common area', kind: 'COMMON', x, y, w: width - x, h: ROW_DEPTH });
    });
  }
  const prices = rooms.flatMap(room => [room.price, room.priceMax]);
  const sizes = [...new Set(rooms.map(room => room.seats))].sort((a, b) => a - b);
  return {
    rooms, areas,
    floors: floorPlan.floors.length, totalRooms: rooms.length,
    beds: rooms.reduce((sum, room) => sum + room.seats, 0),
    price: Math.min(...prices), maxPrice: Math.max(...prices),
    // Kept so photos-per-room-size and the existing "rooms by size" views keep working.
    seaterRooms: sizes.map(seats => {
      const group = rooms.filter(room => room.seats === seats);
      return { seats, rooms: group.length, pricePerBed: Math.min(...group.map(room => room.price)) };
    }),
    pricing: pricing.mode === 'CUSTOM' ? { mode: 'CUSTOM' } : { mode: 'STANDARD', rates: pricing.rates.filter(rate => sizes.includes(rate.seats)), attachedBathExtra: pricing.attachedBathExtra || 0 },
  };
}
