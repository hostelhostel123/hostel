import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';
import { io as connectSocket } from 'socket.io-client';

let mongo, app, server, io, User, Hostel, Session;
const origin = 'http://localhost:5173';
const password = 'Testing-password-123!';
const body = { name: 'Campus Lodge', description: 'Quiet rooms near campus', city: 'Lahore', address: 'Gulberg', price: 20000, beds: 5, amenities: ['WiFi'] };
function write(agent, method, path, data) {
  const req = agent[method](`/api${path}`).set('Origin', origin).set('X-Requested-With', 'HostelHub');
  return data === undefined ? req : req.send(data);
}
async function account(role, name) {
  const agent = request.agent(app);
  const result = await write(agent, 'post', '/auth/register', { name, email: `${name}@example.com`, password, role });
  assert.equal(result.status, 201, JSON.stringify(result.body));
  return { agent, user: result.body.data, cookie: result.headers['set-cookie'][0].split(';')[0] };
}
before(async () => {
  mongo = await MongoMemoryServer.create();
  Object.assign(process.env, { NODE_ENV: 'test', MONGODB_URI: mongo.getUri(), JWT_SECRET: 'test-secret-with-at-least-32-characters', CLIENT_URL: `${origin},http://localhost:5174` });
  ({ User, Hostel, Session } = await import('../src/models/index.js'));
  const { connectDatabase } = await import('../src/config/database.js');
  await connectDatabase();
  await Promise.all(Object.values(mongoose.models).map(model => model.init()));
  const { createApp } = await import('../src/app.js');
  app = createApp();
  server = createServer(app);
  const { attachSockets } = await import('../src/sockets/index.js');
  io = attachSockets(server);
  app.set('io', io);
  server.listen(0);
  await once(server, 'listening');
});
after(async () => {
  if (io) await new Promise(resolve => io.close(resolve));
  if (server?.listening) await new Promise(resolve => server.close(resolve));
  await mongoose.disconnect();
  await mongo?.stop();
});

test('auth rejects role escalation, CSRF, invalid inputs and revoked sessions', async () => {
  const agent = request.agent(app);
  assert.equal((await write(agent, 'post', '/auth/register', { name: 'Intruder', email: 'intruder@example.com', password, role: 'ADMIN' })).status, 400);
  assert.equal((await agent.post('/api/auth/login').send({ email: 'x@example.com', password })).status, 403);
  assert.equal((await agent.post('/api/auth/login').set('Origin', 'https://evil.example').set('X-Requested-With', 'HostelHub').send({ email: 'x@example.com', password })).status, 403);
  const student = await account('STUDENT', 'authstudent');
  assert.equal((await student.agent.get('/api/auth/me')).body.data.role, 'STUDENT');
  assert.equal((await student.agent.get('/api/admin/users')).status, 403);
  assert.equal((await write(student.agent, 'post', '/hostels', body)).status, 403);
  const response = await write(student.agent, 'post', '/auth/logout');
  assert.equal(response.status, 204);
  assert.equal((await request(app).get('/api/auth/me').set('Cookie', student.cookie)).status, 401);
  assert.equal((await write(agent, 'post', '/auth/login', { email: 'authstudent@example.com', password })).status, 200);
  assert.equal((await write(agent, 'post', '/auth/login', { email: 'authstudent@example.com', password: 'wrong' })).status, 401);
  assert.equal((await request(app).get('/api/hostels/not-an-id')).status, 400);
  assert.equal((await request(app).get('/api/hostels?minPrice=100&maxPrice=10')).status, 400);
  assert.equal((await request(app).get('/api/hostels?city[$ne]=x')).status, 400);
});

test('owner -> moderation -> search -> favorites -> private chat -> suspension', async () => {
  const owner = await account('OWNER', 'owner');
  const outsider = await account('OWNER', 'outsider');
  const student = await account('STUDENT', 'student');
  const otherStudent = await account('STUDENT', 'otherstudent');
  const admin = await account('STUDENT', 'admin');
  await User.updateOne({ _id: admin.user.id }, { $set: { role: 'ADMIN' } });
  const created = await write(owner.agent, 'post', '/hostels', body);
  assert.equal(created.status, 201);
  const hostelId = created.body.data._id;
  assert.equal((await owner.agent.get('/api/owner/hostels')).body.pagination.total, 1);
  assert.equal((await owner.agent.get('/api/owner/summary')).body.data.hostels[0].count, 1);
  assert.deepEqual((await outsider.agent.get('/api/owner/summary')).body.data.hostels, []);
  assert.equal((await student.agent.get('/api/owner/summary')).status, 403);
  assert.equal((await request(app).get(`/api/hostels/${hostelId}`)).status, 404);
  assert.equal((await write(outsider.agent, 'put', `/hostels/${hostelId}`, body)).status, 403);
  assert.equal((await write(owner.agent, 'put', `/hostels/${hostelId}`, { ...body, status: 'APPROVED' })).status, 400);
  assert.equal((await write(owner.agent, 'post', `/hostels/${hostelId}/submit`)).status, 400);
  await Hostel.updateOne({ _id: hostelId }, { $set: { images: [{ publicId: 'test/image', url: 'https://example.com/image.jpg' }], coverImage: 'test/image' } });
  assert.equal((await write(owner.agent, 'post', `/hostels/${hostelId}/submit`)).status, 200);
  assert.equal((await write(owner.agent, 'patch', `/admin/hostels/${hostelId}/approve`, {})).status, 403);
  assert.equal((await write(admin.agent, 'patch', `/admin/hostels/${hostelId}/approve`, { reason: '   ' })).status, 200);
  const search = await request(app).get('/api/hostels?city=lahore&maxPrice=25000');
  assert.equal(search.body.pagination.total, 1);
  assert.equal((await write(student.agent, 'post', `/hostels/${hostelId}/favorite`)).status, 204);
  assert.equal((await write(student.agent, 'post', `/hostels/${hostelId}/favorite`)).status, 204);
  assert.equal((await student.agent.get('/api/favorites')).body.data.length, 1);
  assert.equal((await student.agent.get('/api/favorites')).body.pagination.total, 1);
  assert.deepEqual((await student.agent.get('/api/auth/me')).body.data.favoriteIds, [hostelId]);
  const createdChat = await write(student.agent, 'post', '/conversations', { hostelId });
  assert.equal(createdChat.status, 201);
  const conversationId = createdChat.body.data._id;
  assert.equal((await owner.agent.get('/api/conversations')).body.pagination.total, 1);
  assert.equal((await write(student.agent, 'post', '/conversations', { hostelId })).body.data._id, conversationId);
  assert.equal((await otherStudent.agent.get(`/api/conversations/${conversationId}/messages`)).status, 404);
  assert.equal((await write(outsider.agent, 'post', `/conversations/${conversationId}/messages`, { text: 'Spying' })).status, 404);

  const socket = connectSocket(`http://127.0.0.1:${server.address().port}`, { transports: ['websocket'], extraHeaders: { Origin: origin, Cookie: owner.cookie }, reconnection: false });
  try {
    await Promise.race([once(socket, 'connect'), once(socket, 'connect_error').then(([error]) => Promise.reject(error)), new Promise((_, reject) => { const t = setTimeout(() => reject(new Error('Socket connect timed out')), 5000); t.unref(); })]);
    const incoming = once(socket, 'message:new');
    const sent = await write(student.agent, 'post', `/conversations/${conversationId}/messages`, { text: 'Is a room available?' });
    assert.equal(sent.status, 201);
    const [notification] = await incoming;
    assert.equal(notification.text, 'Is a room available?');
    assert.equal((await owner.agent.get('/api/conversations')).body.data[0].unreadCount, 1);
    assert.equal((await write(owner.agent, 'patch', `/conversations/${conversationId}/read`, { through: sent.body.data._id })).status, 204);
    assert.equal((await owner.agent.get('/api/conversations')).body.data[0].unreadCount, 0);
    assert.equal((await owner.agent.get(`/api/conversations/${conversationId}/messages`)).body.data.length, 1);
    assert.equal((await write(owner.agent, 'post', `/conversations/${conversationId}/messages`, { text: 'Yes, welcome!' })).status, 201);
    assert.equal((await admin.agent.get('/api/admin/analytics')).status, 200);
    const disconnected = once(socket, 'disconnect');
    assert.equal((await write(admin.agent, 'patch', `/admin/users/${owner.user.id}`, { active: false })).status, 200);
    await disconnected;
    assert.equal((await owner.agent.get('/api/auth/me')).status, 401);
    assert.equal((await request(app).get(`/api/hostels/${hostelId}`)).status, 404);
    assert.equal((await write(student.agent, 'post', `/conversations/${conversationId}/messages`, { text: 'Hello?' })).status, 409);
    assert.equal(await Session.countDocuments({ user: owner.user.id }), 0);
  } finally { socket.disconnect(); }
});

test('images reject bad bytes and image changes require fresh review', async () => {
  const owner = await account('OWNER', 'imageowner');
  const created = await write(owner.agent, 'post', '/hostels', body);
  const hostelId = created.body.data._id;
  const response = await owner.agent.post(`/api/hostels/${hostelId}/images`).set('Origin', origin).set('X-Requested-With', 'HostelHub').attach('images', Buffer.from('not a real image'), { filename: 'fake.jpg', contentType: 'image/jpeg' });
  assert.equal(response.status, 400);
  await Hostel.updateOne({ _id: hostelId }, { $set: { status: 'APPROVED', images: [{ publicId: 'a', url: 'https://example.com/a' }, { publicId: 'b', url: 'https://example.com/b' }], coverImage: 'a' } });
  assert.equal((await write(owner.agent, 'put', `/hostels/${hostelId}/images`, { publicIds: ['a', 'a'], coverImage: 'a' })).status, 400);
  const result = await write(owner.agent, 'put', `/hostels/${hostelId}/images`, { publicIds: ['b', 'a'], coverImage: 'b' });
  assert.equal(result.status, 200);
  assert.equal(result.body.data.status, 'DRAFT');
  assert.equal(result.body.data.coverImage, 'b');
  assert.equal((await write(owner.agent, 'delete', `/hostels/${hostelId}`)).status, 204);
  assert.equal((await owner.agent.get('/api/owner/hostels')).body.data.length, 0);
});

test('moderation transitions prevent bypassing rejection and suspension', async () => {
  const owner = await account('OWNER', 'reviewowner');
  const admin = await account('STUDENT', 'reviewadmin');
  await User.updateOne({ _id: admin.user.id }, { $set: { role: 'ADMIN' } });
  const created = await write(owner.agent, 'post', '/hostels', body);
  const hostelId = created.body.data._id;
  await Hostel.updateOne({ _id: hostelId }, { $set: { images: [{ publicId: 'review/image', url: 'https://example.com/image.jpg' }] } });
  assert.equal((await write(admin.agent, 'patch', `/admin/hostels/${hostelId}/approve`, {})).status, 409);
  await write(owner.agent, 'post', `/hostels/${hostelId}/submit`);
  assert.equal((await write(admin.agent, 'patch', `/admin/hostels/${hostelId}/reject`, { reason: 'Please clarify the address' })).body.data.status, 'REJECTED');
  assert.equal((await request(app).get(`/api/hostels/${hostelId}`)).status, 404);
  await write(owner.agent, 'put', `/hostels/${hostelId}`, { ...body, address: 'Updated address' });
  await write(owner.agent, 'post', `/hostels/${hostelId}/submit`);
  await write(admin.agent, 'patch', `/admin/hostels/${hostelId}/approve`, {});
  assert.equal((await write(admin.agent, 'patch', `/admin/hostels/${hostelId}/suspend`, { reason: 'Under review' })).body.data.status, 'SUSPENDED');
  assert.equal((await write(owner.agent, 'put', `/hostels/${hostelId}`, body)).status, 409);
  assert.equal((await write(owner.agent, 'post', `/hostels/${hostelId}/submit`)).status, 409);
  assert.equal((await write(admin.agent, 'patch', `/admin/hostels/${hostelId}/restore`, {})).body.data.status, 'DRAFT');
  assert.equal((await write(owner.agent, 'put', `/hostels/${hostelId}`, body)).status, 200);
  assert.equal((await write(admin.agent, 'patch', `/admin/users/${admin.user.id}`, { active: false })).status, 403);
});

test('both portals share compatible auth, profile and origin contracts', async () => {
  const agent = request.agent(app);
  const registration = { username: 'New_Owner', firstName: 'New', lastName: 'Owner', phone: '03001234567', email: 'newowner@example.com', password, role: 'OWNER' };
  assert.equal((await agent.get('/api/auth/username-available?username=New_Owner')).body.data.available, true);
  const registered = await write(agent, 'post', '/auth/register', registration);
  assert.equal(registered.status, 201, JSON.stringify(registered.body));
  assert.equal(registered.body.data.username, 'new_owner');
  assert.equal(registered.body.data.name, 'New Owner');
  assert.equal((await agent.get('/api/auth/username-available?username=new_owner')).body.data.available, false);
  await write(agent, 'post', '/auth/logout');
  assert.equal((await write(agent, 'post', '/auth/login', { username: 'NEW_OWNER', password })).status, 200);
  await write(agent, 'post', '/auth/logout');
  assert.equal((await write(agent, 'post', '/auth/login', { email: 'NEWOWNER@example.com', password })).status, 200);
  const updated = await write(agent, 'patch', '/auth/me', { name: 'Updated Owner', phone: '03123456789' });
  assert.equal(updated.body.data.firstName, 'Updated');
  assert.equal(updated.body.data.phone, '03123456789');
  assert.equal((await write(agent, 'patch', '/auth/me', { name: 'Escalation', role: 'ADMIN' })).status, 400);
  assert.equal((await write(agent, 'post', '/auth/login', { username: 'new_owner', email: registration.email, password })).status, 400);
  assert.equal((await write(agent, 'post', '/auth/login', { password })).status, 400);
  assert.equal((await write(agent, 'post', '/auth/register', { ...registration, email: 'different@example.com' })).status, 409);
  // Legacy student registration must not assign colliding usernames from email prefixes.
  for (const email of ['same@one.example', 'same@two.example']) {
    const response = await write(agent, 'post', '/auth/register', { name: 'Legacy Student', email, password });
    assert.equal(response.status, 201, JSON.stringify(response.body));
    assert.equal(response.body.data.role, 'STUDENT');
    assert.equal(response.body.data.username, undefined);
  }
  assert.equal((await write(agent, 'post', '/auth/login', { username: 'same@one.example', password })).status, 200);
  for (const allowed of [origin, 'http://localhost:5174']) {
    const preflight = await request(app).options('/api/auth/login').set('Origin', allowed).set('Access-Control-Request-Method', 'POST').set('Access-Control-Request-Headers', 'content-type,x-requested-with');
    assert.equal(preflight.headers['access-control-allow-origin'], allowed);
    assert.equal(preflight.headers['access-control-allow-credentials'], 'true');
  }
  assert.equal((await request(app).options('/api/auth/login').set('Origin', 'https://evil.example').set('Access-Control-Request-Method', 'POST')).headers['access-control-allow-origin'], undefined);
});

test('optional room plans are validated and survive edits that omit them', async () => {
  const owner = await account('OWNER', 'planowner');
  const rooms = [{ code: '101', seats: 2, available: 1, price: 20000, x: 0, y: 0, w: 20, h: 20 }];
  const areas = [{ label: 'Corridor', kind: 'CORRIDOR', x: 0, y: 20, w: 40, h: 8 }];
  assert.equal((await write(owner.agent, 'post', '/hostels', { ...body, rooms: [{ ...rooms[0], available: 3 }] })).status, 400);
  const created = await write(owner.agent, 'post', '/hostels', { ...body, rooms, areas });
  assert.equal(created.status, 201, JSON.stringify(created.body));
  assert.equal(created.body.data.rooms[0].floor, 0);
  const edited = await write(owner.agent, 'put', `/hostels/${created.body.data._id}`, { ...body, name: 'Renamed Lodge' });
  assert.equal(edited.status, 200);
  assert.equal(edited.body.data.rooms.length, 1);
  assert.equal(edited.body.data.areas[0].label, 'Corridor');
  const legacy = await write(owner.agent, 'post', '/hostels', body);
  assert.equal(legacy.body.data.rooms, undefined);
});

test('super admins manage staff, create and remove users, and feature listings', async () => {
  const superAdmin = await account('STUDENT', 'chiefadmin');
  await User.updateOne({ _id: superAdmin.user.id }, { $set: { role: 'SUPERADMIN' } });
  const admin = await account('STUDENT', 'deputyadmin');
  await User.updateOne({ _id: admin.user.id }, { $set: { role: 'ADMIN' } });
  const owner = await account('OWNER', 'featuredowner');
  const newUser = { name: 'Added Admin', username: 'Added_Admin', email: 'added@example.com', password, role: 'ADMIN' };
  assert.equal((await write(admin.agent, 'post', '/admin/users', newUser)).status, 403);
  const created = await write(superAdmin.agent, 'post', '/admin/users', newUser);
  assert.equal(created.status, 201, JSON.stringify(created.body));
  assert.equal(created.body.data.username, 'added_admin');
  assert.equal((await write(superAdmin.agent, 'post', '/admin/users', newUser)).status, 409);
  assert.equal((await write(request.agent(app), 'post', '/auth/login', { username: 'added_admin', password })).status, 200);
  assert.equal((await write(admin.agent, 'patch', `/admin/users/${created.body.data.id}`, { active: false })).status, 403);
  assert.equal((await write(superAdmin.agent, 'patch', `/admin/users/${admin.user.id}`, { active: false })).status, 200);
  assert.equal((await admin.agent.get('/api/admin/users')).status, 401);
  assert.equal((await write(superAdmin.agent, 'patch', `/admin/users/${superAdmin.user.id}`, { active: false })).status, 403);
  assert.equal((await write(superAdmin.agent, 'delete', `/admin/users/${superAdmin.user.id}`)).status, 403);

  const hostel = (await write(owner.agent, 'post', '/hostels', body)).body.data;
  assert.equal((await write(superAdmin.agent, 'patch', `/admin/hostels/${hostel._id}/feature`, { featured: true })).status, 409);
  await Hostel.updateOne({ _id: hostel._id }, { $set: { status: 'APPROVED' } });
  const older = await Hostel.create({ ...body, name: 'Plain Lodge', owner: owner.user.id, status: 'APPROVED' });
  assert.equal((await write(superAdmin.agent, 'patch', `/admin/hostels/${hostel._id}/feature`, { featured: true })).body.data.featured, true);
  const listed = await request(app).get('/api/hostels?city=Lahore');
  assert.equal(listed.body.data[0]._id, hostel._id);
  assert.ok(listed.body.data.some(item => item._id === older.id));

  assert.equal((await write(superAdmin.agent, 'delete', `/admin/users/${owner.user.id}`)).status, 204);
  assert.equal(await User.exists({ _id: owner.user.id }), null);
  assert.equal((await request(app).get(`/api/hostels/${hostel._id}`)).status, 404);
  assert.equal((await owner.agent.get('/api/owner/hostels')).status, 401);
});

test('owners verify their mobile number by SMS code before submitting listings', async () => {
  const { setSmsProvider } = await import('../src/services/sms.js');
  const owner = await account('OWNER', 'phoneowner');
  const student = await account('STUDENT', 'phonestudent');
  const hostelId = (await write(owner.agent, 'post', '/hostels', body)).body.data._id;
  assert.equal((await write(owner.agent, 'post', '/auth/phone/send', { phone: '03001234567' })).status, 503);
  assert.equal((await owner.agent.get('/api/auth/me')).body.data.phoneVerificationRequired, false);

  const sent = [];
  setSmsProvider({ send: async phone => { sent.push(phone); }, check: async (phone, code) => phone === sent.at(-1) && code === '246810' });
  try {
    assert.equal((await owner.agent.get('/api/auth/me')).body.data.phoneVerificationRequired, true);
    assert.equal((await write(owner.agent, 'post', `/hostels/${hostelId}/submit`)).status, 403);
    assert.equal((await write(student.agent, 'post', '/auth/phone/send', { phone: '03001234567' })).status, 403);
    assert.equal((await write(owner.agent, 'post', '/auth/phone/send', { phone: '12345' })).status, 400);
    assert.equal((await write(owner.agent, 'post', '/auth/phone/verify', { code: '246810' })).status, 409);
    const result = await write(owner.agent, 'post', '/auth/phone/send', { phone: '0300 123-4567' });
    assert.equal(result.status, 200, JSON.stringify(result.body));
    assert.deepEqual(sent, ['+923001234567']);
    assert.equal((await write(owner.agent, 'post', '/auth/phone/send', { phone: '03001234567' })).status, 429);
    assert.equal((await write(owner.agent, 'post', '/auth/phone/verify', { code: '111111' })).status, 400);
    const verified = await write(owner.agent, 'post', '/auth/phone/verify', { code: '246810' });
    assert.equal(verified.status, 200, JSON.stringify(verified.body));
    assert.equal(verified.body.data.phone, '+923001234567');
    assert.equal(verified.body.data.phoneVerified, true);
    assert.equal(verified.body.data.phoneVerificationRequired, false);
    assert.notEqual((await write(owner.agent, 'post', `/hostels/${hostelId}/submit`)).status, 403);
    const changed = await write(owner.agent, 'patch', '/auth/me', { name: 'Phone Owner', phone: '+923111111111' });
    assert.equal(changed.body.data.phoneVerified, false);
    assert.equal(changed.body.data.phoneVerificationRequired, true);
  } finally { setSmsProvider(null); }
});

test('WhatsApp codes are hashed, single-use, expire and lock after five wrong attempts', async () => {
  const { codeProvider, setSmsProvider } = await import('../src/services/sms.js');
  const { PhoneCode } = await import('../src/models/index.js');
  const messages = [];
  const provider = codeProvider(async (phone, text) => { messages.push({ phone, text }); }, 'whatsapp');
  const codeIn = text => text.match(/\b(\d{6})\b/)[1];

  await provider.send('+923001112222');
  const code = codeIn(messages.at(-1).text);
  const stored = await PhoneCode.findById('+923001112222');
  assert.ok(stored && !JSON.stringify(stored).includes(code));
  assert.equal(await provider.check('+923001112222', code === '000000' ? '111111' : '000000'), false);
  assert.equal(await provider.check('+923001112222', code), true);
  assert.equal(await provider.check('+923001112222', code), false);

  await provider.send('+923001112222');
  const second = codeIn(messages.at(-1).text);
  for (let attempt = 0; attempt < 5; attempt++) assert.equal(await provider.check('+923001112222', second === '999999' ? '888888' : '999999'), false);
  assert.equal(await provider.check('+923001112222', second), false);

  await provider.send('+923001112222');
  await PhoneCode.updateOne({ _id: '+923001112222' }, { $set: { expiresAt: new Date(Date.now() - 1000) } });
  assert.equal(await provider.check('+923001112222', codeIn(messages.at(-1).text)), false);

  const owner = await account('OWNER', 'whatsappowner');
  setSmsProvider(provider);
  try {
    const sent = await write(owner.agent, 'post', '/auth/phone/send', { phone: '+92 300 333 4444' });
    assert.equal(sent.body.data.channel, 'whatsapp');
    assert.equal(messages.at(-1).phone, '+923003334444');
    assert.equal((await write(owner.agent, 'post', '/auth/phone/verify', { code: codeIn(messages.at(-1).text) })).body.data.phoneVerified, true);
  } finally { setSmsProvider(null); }

  const superAdmin = await account('STUDENT', 'linkadmin');
  await User.updateOne({ _id: superAdmin.user.id }, { $set: { role: 'SUPERADMIN' } });
  const admin = await account('STUDENT', 'plainadmin');
  await User.updateOne({ _id: admin.user.id }, { $set: { role: 'ADMIN' } });
  assert.equal((await admin.agent.get('/api/admin/whatsapp')).status, 403);
  const status = await superAdmin.agent.get('/api/admin/whatsapp');
  assert.equal(status.status, 200);
  assert.equal(status.body.data.linked, false);
});

test('without Cloudinary, photos are shrunk to WebP, stored in MongoDB and served cross-origin', async () => {
  const { default: sharp } = await import('sharp');
  const { ImageFile } = await import('../src/models/index.js');
  const owner = await account('OWNER', 'photoowner');
  const hostelId = (await write(owner.agent, 'post', '/hostels', body)).body.data._id;
  const photo = await sharp({ create: { width: 3000, height: 2000, channels: 3, background: '#7a9' } }).jpeg().toBuffer();
  const uploaded = await owner.agent.post(`/api/hostels/${hostelId}/images`).set('Origin', origin).set('X-Requested-With', 'HostelHub').attach('images', photo, { filename: 'room.jpg', contentType: 'image/jpeg' });
  assert.equal(uploaded.status, 201, JSON.stringify(uploaded.body));
  const [image] = uploaded.body.data.images;
  assert.match(image.publicId, /^db:/);
  assert.equal(uploaded.body.data.coverImage, image.publicId);
  const path = new URL(image.url).pathname;
  const served = await request(app).get(path).buffer(true).parse((res, done) => { const chunks = []; res.on('data', chunk => chunks.push(chunk)); res.on('end', () => done(null, Buffer.concat(chunks))); });
  assert.equal(served.status, 200);
  assert.equal(served.headers['content-type'], 'image/webp');
  assert.equal(served.headers['cross-origin-resource-policy'], 'cross-origin');
  assert.match(served.headers['cache-control'], /immutable/);
  const { width, height, format } = await sharp(served.body).metadata();
  assert.deepEqual({ width, height, format }, { width: 1600, height: 1067, format: 'webp' });
  assert.equal((await request(app).get('/api/images/not-a-uuid')).status, 400);
  assert.equal((await write(owner.agent, 'delete', `/hostels/${hostelId}/images`, { publicId: image.publicId })).status, 200);
  assert.equal(await ImageFile.countDocuments(), 0);
  assert.equal((await request(app).get(path)).status, 404);
});

test('listings record rooms by size with bed prices and need a photo of each room size', async () => {
  const { default: sharp } = await import('sharp');
  const owner = await account('OWNER', 'seaterowner');
  const details = { name: 'Seater House', city: 'Lahore', address: 'Johar Town', description: 'Rooms near campus', floors: 3, totalRooms: 10, gender: 'MALE', amenities: ['WiFi'], mealsPerDay: 2, universities: ['UCP', 'PU'] };
  const seaterRooms = [{ seats: 1, rooms: 2, pricePerBed: 25000 }, { seats: 2, rooms: 4, pricePerBed: 18000 }, { seats: 3, rooms: 0, pricePerBed: 0 }];
  assert.equal((await write(owner.agent, 'post', '/hostels', { ...details, seaterRooms: [{ seats: 1, rooms: 6, pricePerBed: 1 }, { seats: 2, rooms: 5, pricePerBed: 1 }] })).status, 400);
  assert.equal((await write(owner.agent, 'post', '/hostels', { ...details, seaterRooms: [{ seats: 2, rooms: 3, pricePerBed: 0 }] })).status, 400);
  assert.equal((await write(owner.agent, 'post', '/hostels', { ...details, seaterRooms: [{ seats: 2, rooms: 1, pricePerBed: 1 }, { seats: 2, rooms: 1, pricePerBed: 1 }] })).status, 400);
  assert.equal((await write(owner.agent, 'post', '/hostels', { ...details, seaterRooms: [{ seats: 2, rooms: 0, pricePerBed: 1 }] })).status, 400);
  const created = await write(owner.agent, 'post', '/hostels', { ...details, seaterRooms });
  assert.equal(created.status, 201, JSON.stringify(created.body));
  const hostel = created.body.data;
  assert.deepEqual(hostel.seaterRooms.map(type => type.seats), [1, 2]);
  assert.equal(hostel.price, 18000);
  assert.equal(hostel.beds, 10);
  assert.equal(hostel.mealsPerDay, 2);
  assert.deepEqual(hostel.universities, ['UCP', 'PU']);

  const photo = await sharp({ create: { width: 400, height: 300, channels: 3, background: '#a87' } }).jpeg().toBuffer();
  const uploadFor = seats => owner.agent.post(`/api/hostels/${hostel._id}/images`).set('Origin', origin).set('X-Requested-With', 'HostelHub').field('seats', String(seats)).attach('images', photo, { filename: 'room.jpg', contentType: 'image/jpeg' });
  assert.equal((await uploadFor(3)).status, 400);
  const first = await uploadFor(1);
  assert.equal(first.status, 201, JSON.stringify(first.body));
  assert.equal(first.body.data.images[0].seats, 1);
  const blocked = await write(owner.agent, 'post', `/hostels/${hostel._id}/submit`);
  assert.equal(blocked.status, 400);
  assert.match(blocked.body.error.message, /2-seater/);
  assert.equal((await uploadFor(2)).status, 201);
  assert.equal((await write(owner.agent, 'post', `/hostels/${hostel._id}/submit`)).body.data.status, 'PENDING');
});

test('owners attach a YouTube video tour by link, and changing it needs a fresh review', async () => {
  const { youtubeIdFrom } = await import('../src/controllers/hostels.js');
  for (const link of ['https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=10s', 'https://youtu.be/dQw4w9WgXcQ?si=abc', 'youtube.com/shorts/dQw4w9WgXcQ', 'https://m.youtube.com/watch?v=dQw4w9WgXcQ', 'https://www.youtube.com/embed/dQw4w9WgXcQ', 'dQw4w9WgXcQ']) assert.equal(youtubeIdFrom(link), 'dQw4w9WgXcQ', link);
  for (const link of ['https://vimeo.com/123', 'https://youtube.com.evil.example/watch?v=dQw4w9WgXcQ', 'https://www.youtube.com/watch?v=short', 'not a link']) assert.equal(youtubeIdFrom(link), null, link);

  const owner = await account('OWNER', 'videoowner');
  const other = await account('OWNER', 'othervideoowner');
  const hostelId = (await write(owner.agent, 'post', '/hostels', body)).body.data._id;
  assert.equal((await write(other.agent, 'put', `/hostels/${hostelId}/video`, { url: 'https://youtu.be/dQw4w9WgXcQ' })).status, 403);
  assert.equal((await write(owner.agent, 'put', `/hostels/${hostelId}/video`, { url: 'https://vimeo.com/123' })).status, 400);
  await Hostel.updateOne({ _id: hostelId }, { $set: { status: 'APPROVED' } });
  const saved = await write(owner.agent, 'put', `/hostels/${hostelId}/video`, { url: 'https://youtu.be/dQw4w9WgXcQ' });
  assert.equal(saved.body.data.youtubeId, 'dQw4w9WgXcQ');
  assert.equal(saved.body.data.status, 'DRAFT');
  await Hostel.updateOne({ _id: hostelId }, { $set: { status: 'APPROVED' } });
  assert.equal((await request(app).get(`/api/hostels/${hostelId}`)).body.data.youtubeId, 'dQw4w9WgXcQ');
  assert.equal((await write(owner.agent, 'put', `/hostels/${hostelId}/video`, { url: '' })).body.data.youtubeId, undefined);
});
