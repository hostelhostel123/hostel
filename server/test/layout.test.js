import { test } from 'node:test';
import assert from 'node:assert/strict';

Object.assign(process.env, { NODE_ENV: 'test', MONGODB_URI: 'mongodb://127.0.0.1/unused', JWT_SECRET: 'test-secret-with-at-least-32-characters', CLIENT_URL: 'http://localhost:5173' });
const { hostelSchema } = await import('../src/routes/index.js');
const { Hostel } = await import('../src/models/index.js');

const details = { name: 'Plan House', description: 'Rooms on two floors', city: 'Lahore', address: 'Gulberg', gender: 'MALE', amenities: ['WiFi'], mealsPerDay: 2 };
const floorPlan = { floors: [
  { rooms: [{ seats: 1, bath: 'ATTACHED' }, { seats: 2, bath: 'SHARED', available: 1 }, { seats: 3, bath: 'SHARED' }] },
  { rooms: [{ seats: 2, bath: 'ATTACHED', code: 'Suite A' }, { seats: 4, bath: 'SHARED', available: 0 }] },
] };
const standard = { mode: 'STANDARD', rates: [{ seats: 1, price: 30000 }, { seats: 2, price: 22000 }, { seats: 3, price: 18000 }, { seats: 4, price: 15000 }, { seats: 5, price: 12000 }], attachedBathExtra: 3000 };

test('standard rates price every seat by room size plus the attached-bath extra', () => {
  const body = hostelSchema.parse({ ...details, floorPlan, pricing: standard });
  assert.equal(body.floorPlan, undefined);
  assert.equal(body.floors, 2);
  assert.equal(body.totalRooms, 5);
  assert.equal(body.beds, 12);
  assert.equal(body.price, 15000);
  assert.equal(body.maxPrice, 33000);
  const byCode = Object.fromEntries(body.rooms.map(room => [room.code, room]));
  assert.deepEqual(Object.keys(byCode).sort(), ['G01', 'G02', 'G03', 'Suite A', '102'].sort());
  assert.equal(byCode.G01.price, 33000);
  assert.equal(byCode['Suite A'].price, 25000);
  assert.equal(byCode.G02.available, 1);
  assert.equal(byCode.G03.available, 3);
  assert.deepEqual(body.seaterRooms, [{ seats: 1, rooms: 1, pricePerBed: 33000 }, { seats: 2, rooms: 2, pricePerBed: 22000 }, { seats: 3, rooms: 1, pricePerBed: 18000 }, { seats: 4, rooms: 1, pricePerBed: 15000 }]);
  assert.deepEqual(body.pricing.rates.map(rate => rate.seats), [1, 2, 3, 4]);
  assert.equal(new Hostel({ ...body, owner: '65f000000000000000000000' }).validateSync(), undefined);
});

test('the generated plan keeps rooms on their floor without overlaps', () => {
  const { rooms, areas } = hostelSchema.parse({ ...details, floorPlan, pricing: standard });
  for (const floor of [0, 1]) {
    const shapes = [...rooms, ...areas].filter(item => item.floor === floor);
    const width = Math.max(...shapes.map(item => item.x + item.w));
    for (const [index, a] of shapes.entries()) for (const b of shapes.slice(index + 1)) {
      const overlap = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x) > 0.01 && Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y) > 0.01;
      assert.equal(overlap, false, `${a.code || a.label} overlaps ${b.code || b.label} on floor ${floor}`);
    }
    assert.ok(areas.some(area => area.floor === floor && area.kind === 'CORRIDOR' && area.w === width));
    assert.ok(areas.some(area => area.floor === floor && area.kind === 'STAIRS'));
  }
});

test('custom pricing uses each seat price and requires all of them', () => {
  const custom = { floors: [{ rooms: [{ seats: 2, bath: 'SHARED', seatPrices: [20000, 24000] }, { seats: 1, bath: 'ATTACHED', seatPrices: [35000] }] }] };
  const body = hostelSchema.parse({ ...details, floorPlan: custom, pricing: { mode: 'CUSTOM' } });
  assert.equal(body.price, 20000);
  assert.equal(body.maxPrice, 35000);
  assert.deepEqual(body.rooms.find(room => room.seats === 2).seatPrices, [20000, 24000]);
  assert.deepEqual(body.pricing, { mode: 'CUSTOM' });
  assert.throws(() => hostelSchema.parse({ ...details, floorPlan: { floors: [{ rooms: [{ seats: 2, bath: 'SHARED', seatPrices: [20000] }] }] }, pricing: { mode: 'CUSTOM' } }), /every seat/);
});

test('plans are validated and legacy rooms-by-size listings still work', () => {
  assert.throws(() => hostelSchema.parse({ ...details, floorPlan, pricing: { mode: 'STANDARD', rates: [{ seats: 1, price: 30000 }] } }), /2-seater, 3-seater, 4-seater/);
  assert.throws(() => hostelSchema.parse({ ...details, floorPlan }), /how rooms are priced/);
  assert.throws(() => hostelSchema.parse({ ...details, floorPlan: { floors: [{ rooms: [] }] }, pricing: standard }), /at least one room/);
  assert.throws(() => hostelSchema.parse({ ...details, floorPlan: { floors: [{ rooms: [{ seats: 2, bath: 'SHARED', available: 3 }] }] }, pricing: standard }), /Free seats/);
  const legacy = hostelSchema.parse({ ...details, floors: 1, totalRooms: 3, seaterRooms: [{ seats: 2, rooms: 3, pricePerBed: 20000 }] });
  assert.equal(legacy.price, 20000);
  assert.equal(legacy.beds, 6);
  assert.equal(legacy.rooms, undefined);
});

test('every floor fills the same footprint with no sliver spaces', () => {
  for (const counts of [[1], [3, 5], [6, 2, 9], [40]]) {
    const plan = { floors: counts.map(count => ({ rooms: Array.from({ length: count }, (_, index) => ({ seats: index % 5 + 1, bath: index % 3 ? 'SHARED' : 'ATTACHED' })) })) };
    const { rooms, areas } = hostelSchema.parse({ ...details, floorPlan: plan, pricing: standard });
    const width = Math.max(...[...rooms, ...areas].map(item => item.x + item.w));
    assert.ok(width <= 1000);
    for (const [floor] of counts.entries()) for (const y of [0, 32]) {
      const row = [...rooms, ...areas].filter(item => item.floor === floor && item.y === y);
      assert.equal(row.reduce((sum, item) => sum + item.w, 0), width, `floor ${floor} row ${y} spans the building`);
      assert.ok(row.every(item => item.w >= 7), `floor ${floor} has a sliver`);
    }
  }
});
