import { Hostel, User, Conversation, Message } from '../models/index.js';
import { HttpError } from '../middleware/http.js';
import { ownedHostel, requireEditable, resetReview } from '../services/hostels.js';

const escapeRegex = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
export async function list(req, res) {
  const { page, limit, city, q, minPrice, maxPrice, gender, sort } = req.validated.query;
  const filter = { status: 'APPROVED', deletedAt: null };
  if (city) filter.city = new RegExp(`^${escapeRegex(city)}$`, 'i');
  if (q) filter.$or = ['name', 'city', 'address'].map(key => ({ [key]: new RegExp(escapeRegex(q), 'i') }));
  if (gender) filter.gender = gender;
  if (minPrice !== undefined || maxPrice !== undefined) filter.price = { ...(minPrice !== undefined && { $gte: minPrice }), ...(maxPrice !== undefined && { $lte: maxPrice }) };
  const order = { featured: -1, ...{ newest: { createdAt: -1, _id: -1 }, priceAsc: { price: 1, _id: 1 }, priceDesc: { price: -1, _id: -1 } }[sort] };
  const [data, total] = await Promise.all([Hostel.find(filter).sort(order).skip((page - 1) * limit).limit(limit), Hostel.countDocuments(filter)]);
  res.json({ data, pagination: { page, limit, total } });
}
export async function detail(req, res) {
  const data = await Hostel.findOne({ _id: req.params.id, status: 'APPROVED', deletedAt: null }).populate('owner', 'name');
  if (!data) throw new HttpError(404, 'Hostel not found');
  res.json({ data });
}
export async function mine(req, res) {
  const { page, limit } = req.validated.query;
  const filter = { owner: req.user._id, deletedAt: null };
  const [data, total] = await Promise.all([Hostel.find(filter).sort({ createdAt: -1, _id: -1 }).skip((page - 1) * limit).limit(limit), Hostel.countDocuments(filter)]);
  res.json({ data, pagination: { page, limit, total } });
}
export async function summary(req, res) {
  const [hostels, conversations, unreadMessages] = await Promise.all([
    Hostel.aggregate([{ $match: { owner: req.user._id, deletedAt: null } }, { $group: { _id: '$status', count: { $sum: 1 } } }]),
    Conversation.countDocuments({ owner: req.user._id }),
    Message.countDocuments({ recipient: req.user._id, readAt: null }),
  ]);
  res.json({ data: { hostels, conversations, unreadMessages } });
}
export async function create(req, res) {
  res.status(201).json({ data: await Hostel.create({ ...req.validated.body, owner: req.user._id }) });
}
export async function update(req, res) {
  const hostel = await ownedHostel(req.params.id, req.user);
  requireEditable(hostel);
  Object.assign(hostel, req.validated.body);
  resetReview(hostel);
  await hostel.save();
  res.json({ data: hostel });
}
export async function submit(req, res) {
  const hostel = await ownedHostel(req.params.id, req.user);
  requireEditable(hostel);
  if (!['DRAFT', 'REJECTED'].includes(hostel.status)) throw new HttpError(409, 'Listing is already submitted');
  if (!hostel.images.length) throw new HttpError(400, 'Upload at least one image before submitting');
  hostel.status = 'PENDING';
  await hostel.save();
  res.json({ data: hostel });
}
export async function remove(req, res) {
  const hostel = await ownedHostel(req.params.id, req.user);
  hostel.deletedAt = new Date();
  await hostel.save();
  res.status(204).end();
}
export async function favorite(req, res) {
  if (req.method === 'POST' && !await Hostel.exists({ _id: req.params.id, status: 'APPROVED', deletedAt: null })) throw new HttpError(404, 'Hostel not found');
  await User.updateOne({ _id: req.user._id }, { [req.method === 'POST' ? '$addToSet' : '$pull']: { favorites: req.params.id } });
  res.status(204).end();
}
export async function favorites(req, res) {
  const { page, limit } = req.validated.query;
  const filter = { _id: { $in: req.user.favorites }, status: 'APPROVED', deletedAt: null };
  const [data, total] = await Promise.all([Hostel.find(filter).sort({ _id: -1 }).skip((page - 1) * limit).limit(limit), Hostel.countDocuments(filter)]);
  res.json({ data, pagination: { page, limit, total } });
}
