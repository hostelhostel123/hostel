import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import multer from 'multer';
import { z } from 'zod';
import { authenticate, roles } from '../middleware/auth.js';
import { id, pagination, validate } from '../middleware/http.js';
import { publicUser } from '../services/auth.js';
import { buildLayout } from '../services/layout.js';
import { env } from '../config/env.js';
import * as auth from '../controllers/auth.js';
import * as hostels from '../controllers/hostels.js';
import * as images from '../controllers/images.js';
import * as admin from '../controllers/admin.js';
import * as chat from '../controllers/chat.js';

export const router = Router();
const text = max => z.string().trim().min(1).max(max);
const optionalText = max => z.preprocess(value => typeof value === 'string' && value.trim() === '' ? undefined : value, text(max).optional());
const email = z.email().max(254).transform(value => value.toLowerCase());
const password = z.string().min(10).max(72).refine(value => Buffer.byteLength(value, 'utf8') <= 72, 'Password must be at most 72 bytes');
// The API test suite registers far more accounts than one person would in 15 minutes.
const authLimit = rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, skip: () => env.NODE_ENV === 'test', standardHeaders: 'draft-8', legacyHeaders: false, message: { error: { message: 'Too many authentication attempts' } } });
const username = z.string().trim().toLowerCase().min(3).max(24).regex(/^[a-z0-9_]+$/, 'Use 3–24 letters, numbers, or underscores');
router.get('/auth/username-available', authLimit, validate(z.object({ username }).strict(), 'query'), auth.usernameAvailable);
router.post('/auth/register', authLimit, validate(z.object({ firstName: text(60).optional(), lastName: text(60).optional(), phone: text(30).optional(), name: text(100).optional(), username: username.optional(), email, password, role: z.enum(['STUDENT', 'OWNER']).default('STUDENT') }).strict().refine(data => data.name || (data.firstName && data.lastName), 'Supply a name or both first and last name').refine(data => Boolean(data.firstName) === Boolean(data.lastName), 'Supply both first and last name')) , auth.register);
router.post('/auth/login', authLimit, validate(z.object({ username: z.string().trim().min(1).max(254).optional(), email: email.optional(), password: z.string().min(1).max(200) }).strict().refine(data => Boolean(data.username) !== Boolean(data.email), 'Supply either username or email')), auth.login);
router.post('/auth/logout', authenticate, auth.logout);
router.get('/auth/me', authenticate, (req, res) => res.json({ data: publicUser(req.user) }));
router.patch('/auth/me', authenticate, validate(z.object({ name: text(100), phone: z.string().trim().max(30).optional() }).strict()), auth.profile);

const planBox = { floor: z.number().int().min(0).max(50).default(0), x: z.number().min(0).max(1000), y: z.number().min(0).max(1000), w: z.number().min(1).max(1000), h: z.number().min(1).max(1000) };
const room = z.object({ code: text(20), seats: z.number().int().min(1).max(20), available: z.number().int().min(0).max(20), price: z.number().min(0).max(10000000), ...planBox }).strict().refine(value => value.available <= value.seats, 'Available seats cannot exceed room capacity');
const area = z.object({ label: text(60), kind: z.enum(['CORRIDOR', 'STAIRS', 'BATH', 'KITCHEN', 'COMMON', 'STUDY', 'OTHER']).default('OTHER'), ...planBox }).strict();
const seaterRoom = z.object({ seats: z.number().int().min(1).max(5), rooms: z.number().int().min(0).max(1000), pricePerBed: z.number().min(0).max(10000000) }).strict();
// Floors → rooms → seats, as the owner describes the building. The server prices each seat and draws the plan.
const planRoom = z.object({ code: text(20).optional(), seats: z.number().int().min(1).max(5), bath: z.enum(['ATTACHED', 'SHARED']), available: z.number().int().min(0).max(5).optional(), seatPrices: z.array(z.number().min(0).max(10000000)).max(5).optional() }).strict()
  .refine(value => value.available === undefined || value.available <= value.seats, 'Free seats cannot exceed the room size');
const floorPlan = z.object({ floors: z.array(z.object({ rooms: z.array(planRoom).max(40) }).strict()).min(1).max(20) }).strict();
const pricing = z.object({ mode: z.enum(['STANDARD', 'CUSTOM']), rates: z.array(z.object({ seats: z.number().int().min(1).max(5), price: z.number().min(0).max(10000000) }).strict()).max(5).default([]), attachedBathExtra: z.number().min(0).max(10000000).default(0) }).strict();
export const hostelSchema = z.object({
  name: text(150), description: text(5000), city: text(100), address: text(300),
  price: z.number().min(0).max(10000000).optional(), beds: z.number().int().min(0).max(10000).optional(),
  floors: z.number().int().min(1).max(50).optional(), totalRooms: z.number().int().min(1).max(1000).optional(),
  seaterRooms: z.array(seaterRoom).min(1).max(5).optional(),
  gender: z.enum(['MALE', 'FEMALE', 'ANY']).default('ANY'), amenities: z.array(text(80)).max(30).default([]),
  mealsPerDay: z.number().int().min(0).max(3).optional(), universities: z.array(text(120)).max(20).optional(),
  rooms: z.array(room).max(300).optional(), areas: z.array(area).max(300).optional(),
  floorPlan: floorPlan.optional(), pricing: pricing.optional(),
}).strict().superRefine((value, ctx) => {
  if (value.floorPlan) {
    const rooms = value.floorPlan.floors.flatMap(floor => floor.rooms);
    if (!rooms.length) ctx.addIssue({ code: 'custom', message: 'Add at least one room' });
    if (!value.pricing) { ctx.addIssue({ code: 'custom', message: 'Choose how rooms are priced' }); return; }
    if (value.pricing.mode === 'STANDARD') {
      const missing = [...new Set(rooms.map(room => room.seats))].filter(seats => !value.pricing.rates.some(rate => rate.seats === seats && rate.price > 0));
      if (missing.length) ctx.addIssue({ code: 'custom', message: `Enter the price of a bed in ${missing.map(seats => `${seats}-seater`).join(', ')} rooms` });
    } else if (rooms.some(room => room.seatPrices?.length !== room.seats || room.seatPrices.some(price => !price))) ctx.addIssue({ code: 'custom', message: 'Enter a price for every seat in every room' });
    return;
  }
  if (!value.seaterRooms) {
    if (value.price === undefined || value.beds === undefined) ctx.addIssue({ code: 'custom', message: 'Enter the rooms of each size and their bed prices' });
    return;
  }
  const used = value.seaterRooms.filter(type => type.rooms > 0);
  if (new Set(value.seaterRooms.map(type => type.seats)).size !== value.seaterRooms.length) ctx.addIssue({ code: 'custom', message: 'Each room size can only be listed once' });
  if (!used.length) ctx.addIssue({ code: 'custom', message: 'Enter at least one room' });
  if (!value.totalRooms) ctx.addIssue({ code: 'custom', message: 'Enter the total number of rooms' });
  else if (used.reduce((sum, type) => sum + type.rooms, 0) > value.totalRooms) ctx.addIssue({ code: 'custom', message: 'The rooms of each size add up to more than the total number of rooms' });
  if (used.some(type => !type.pricePerBed)) ctx.addIssue({ code: 'custom', message: 'Enter the price of a bed for every room size you have' });
}).transform(value => {
  if (value.floorPlan) { const { floorPlan: plan, pricing: rates, ...rest } = value; return { ...rest, ...buildLayout(plan, rates) }; }
  if (!value.seaterRooms) return value;
  const seaterRooms = value.seaterRooms.filter(type => type.rooms > 0).sort((a, b) => a.seats - b.seats);
  return { ...value, seaterRooms, price: Math.min(...seaterRooms.map(type => type.pricePerBed)), beds: seaterRooms.reduce((sum, type) => sum + type.rooms * type.seats, 0) };
});
const owner = [authenticate, roles('OWNER')];
const student = [authenticate, roles('STUDENT')];
const adminOnly = [authenticate, roles('ADMIN', 'SUPERADMIN')];
const superAdminOnly = [authenticate, roles('SUPERADMIN')];
const validId = validate(z.object({ id }), 'params');
const smsLimit = rateLimit({ windowMs: 60 * 60 * 1000, limit: 5, standardHeaders: 'draft-8', legacyHeaders: false, message: { error: { message: 'Too many verification codes requested. Try again in an hour.' } } });
router.post('/auth/phone/send', ...owner, smsLimit, validate(z.object({ phone: text(30) }).strict()), auth.sendPhoneCode);
const codeLimit = rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: 'draft-8', legacyHeaders: false, message: { error: { message: 'Too many code attempts. Try again in 15 minutes.' } } });
router.post('/auth/phone/verify', ...owner, codeLimit, validate(z.object({ code: z.string().trim().regex(/^\d{4,10}$/, 'Enter the code from the SMS') }).strict()), auth.verifyPhoneCode);
router.get('/hostels', validate(pagination.extend({ city: text(100).optional(), q: text(100).optional(), gender: z.enum(['MALE', 'FEMALE', 'ANY']).optional(), minPrice: z.coerce.number().min(0).optional(), maxPrice: z.coerce.number().min(0).optional(), sort: z.enum(['newest', 'priceAsc', 'priceDesc']).default('newest') }).refine(value => value.minPrice === undefined || value.maxPrice === undefined || value.minPrice <= value.maxPrice, 'Invalid price range'), 'query'), hostels.list);
router.get('/owner/hostels', ...owner, validate(pagination, 'query'), hostels.mine);
router.get('/owner/summary', ...owner, hostels.summary);
router.get('/favorites', ...student, validate(pagination, 'query'), hostels.favorites);
router.get('/hostels/:id', validId, hostels.detail);
router.post('/hostels', ...owner, validate(hostelSchema), hostels.create);
router.put('/hostels/:id', ...owner, validId, validate(hostelSchema), hostels.update);
router.delete('/hostels/:id', ...owner, validId, hostels.remove);
router.post('/hostels/:id/submit', ...owner, validId, hostels.submit);
router.put('/hostels/:id/video', ...owner, validId, validate(z.object({ url: z.string().trim().max(300) }).strict()), hostels.setVideo);
router.post('/hostels/:id/favorite', ...student, validId, hostels.favorite);
router.delete('/hostels/:id/favorite', ...student, validId, hostels.favorite);
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024, files: 10, fields: 1 } });
router.post('/hostels/:id/images', ...owner, validId, upload.array('images', 10), validate(z.object({ seats: z.coerce.number().int().min(1).max(5).optional() }).strict()), images.upload);
router.put('/hostels/:id/images', ...owner, validId, validate(z.object({ publicIds: z.array(text(200)).min(1).max(10), coverImage: text(200) }).strict()), images.arrange);
router.delete('/hostels/:id/images', ...owner, validId, validate(z.object({ publicId: text(200) }).strict()), images.remove);
router.get('/images/:imageId', validate(z.object({ imageId: z.uuid() }), 'params'), images.show);

router.get('/admin/hostels', ...adminOnly, validate(pagination.extend({ status: z.enum(['DRAFT', 'PENDING', 'APPROVED', 'REJECTED', 'SUSPENDED']).optional() }), 'query'), admin.hostels);
router.patch('/admin/hostels/:id/feature', ...superAdminOnly, validId, validate(z.object({ featured: z.boolean() }).strict()), admin.feature);
router.patch('/admin/hostels/:id/:action', ...adminOnly, validate(z.object({ id, action: z.enum(['approve', 'reject', 'suspend', 'restore']) }), 'params'), validate(z.object({ reason: optionalText(1000) }).strict()), admin.moderate);
router.get('/admin/users', ...adminOnly, validate(pagination, 'query'), admin.users);
router.post('/admin/users', ...superAdminOnly, validate(z.object({ name: text(100), username, email, password, role: z.enum(['STUDENT', 'OWNER', 'ADMIN', 'SUPERADMIN']) }).strict()), admin.createUser);
router.patch('/admin/users/:id', ...adminOnly, validId, validate(z.object({ active: z.boolean() }).strict()), admin.setActive);
router.delete('/admin/users/:id', ...superAdminOnly, validId, admin.removeUser);
router.get('/admin/analytics', ...adminOnly, admin.analytics);
router.get('/admin/whatsapp', ...superAdminOnly, admin.whatsappStatus);
router.post('/admin/whatsapp/link', ...superAdminOnly, admin.whatsappLink);
router.post('/admin/whatsapp/unlink', ...superAdminOnly, admin.whatsappUnlink);

router.use('/conversations', authenticate, roles('STUDENT', 'OWNER'));
router.get('/conversations', validate(pagination, 'query'), chat.list);
router.post('/conversations', roles('STUDENT'), validate(z.object({ hostelId: id }).strict()), chat.create);
router.get('/conversations/:id/messages', validId, validate(z.object({ before: id.optional(), limit: z.coerce.number().int().min(1).max(100).default(50) }), 'query'), chat.messages);
export const messageSchema = z.object({ text: text(4000) }).strict();
router.post('/conversations/:id/messages', validId, validate(messageSchema), chat.send);
router.patch('/conversations/:id/read', validId, validate(z.object({ through: id }).strict()), chat.read);
