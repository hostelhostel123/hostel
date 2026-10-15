import bcrypt from 'bcryptjs';
import { Hostel, User, Message, Conversation, Session } from '../models/index.js';
import { HttpError } from '../middleware/http.js';
import { publicUser } from '../services/auth.js';
import * as whatsapp from '../services/whatsapp.js';

export const whatsappStatus = (req, res) => res.json({ data: whatsapp.getStatus() });
export async function whatsappLink(req, res) {
  await whatsapp.start();
  res.json({ data: whatsapp.getStatus() });
}
export async function whatsappUnlink(req, res) {
  await whatsapp.unlink();
  res.json({ data: whatsapp.getStatus() });
}

export async function hostels(req, res) {
  const { page, limit, status } = req.validated.query;
  const filter = { deletedAt: null, ...(status && { status }) };
  const [data, total] = await Promise.all([Hostel.find(filter).populate('owner', 'name email').sort({ updatedAt: -1 }).skip((page - 1) * limit).limit(limit), Hostel.countDocuments(filter)]);
  res.json({ data, pagination: { page, limit, total } });
}
export async function moderate(req, res) {
  const hostel = await Hostel.findOne({ _id: req.params.id, deletedAt: null });
  if (!hostel) throw new HttpError(404, 'Hostel not found');
  const actions = { approve: ['PENDING'], reject: ['PENDING'], suspend: ['APPROVED'], restore: ['SUSPENDED'] };
  if (!actions[req.params.action]?.includes(hostel.status)) throw new HttpError(409, 'Invalid moderation transition');
  if (req.params.action === 'approve' && !await User.exists({ _id: hostel.owner, active: true })) throw new HttpError(409, 'Owner account is suspended');
  hostel.status = { approve: 'APPROVED', reject: 'REJECTED', suspend: 'SUSPENDED', restore: 'DRAFT' }[req.params.action];
  hostel.moderationReason = req.validated.body.reason || '';
  hostel.moderatedBy = req.user._id;
  hostel.moderatedAt = new Date();
  await hostel.save();
  res.json({ data: hostel });
}
export async function users(req, res) {
  const { page, limit } = req.validated.query;
  const [users, total] = await Promise.all([User.find().sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit), User.countDocuments()]);
  res.json({ data: users.map(publicUser), pagination: { page, limit, total } });
}
const staffRoles = ['ADMIN', 'SUPERADMIN'];
async function managedUser(req) {
  const user = await User.findById(req.params.id);
  if (!user) throw new HttpError(404, 'User not found');
  if (user.id === req.user.id) throw new HttpError(403, 'You cannot change your own account here');
  if (staffRoles.includes(user.role) && req.user.role !== 'SUPERADMIN') throw new HttpError(403, 'Only a super admin can manage admin accounts');
  return user;
}
async function signOutEverywhere(req, user) {
  await Session.deleteMany({ user: user._id });
  req.app.get('io')?.in(`user:${user.id}`).disconnectSockets(true);
}
export async function setActive(req, res) {
  const user = await managedUser(req);
  user.active = req.validated.body.active;
  await user.save();
  if (!user.active) {
    await signOutEverywhere(req, user);
    await Hostel.updateMany({ owner: user._id, status: 'APPROVED' }, { $set: { status: 'SUSPENDED', moderationReason: 'Owner account suspended', moderatedBy: req.user._id, moderatedAt: new Date() }, $inc: { __v: 1 } });
  }
  res.json({ data: publicUser(user) });
}
export async function createUser(req, res) {
  const { password, name, ...data } = req.validated.body;
  if (await User.exists({ $or: [{ email: data.email }, { username: data.username }] })) throw new HttpError(409, 'That username or email is already taken');
  const [firstName, ...lastName] = name.split(/\s+/);
  const user = await User.create({ ...data, name, firstName, lastName: lastName.join(' '), password: await bcrypt.hash(password, 12) });
  res.status(201).json({ data: publicUser(user) });
}
export async function removeUser(req, res) {
  const user = await managedUser(req);
  await signOutEverywhere(req, user);
  const conversations = await Conversation.find({ $or: [{ student: user._id }, { owner: user._id }] }).distinct('_id');
  await Promise.all([
    Message.deleteMany({ conversation: { $in: conversations } }), Conversation.deleteMany({ _id: { $in: conversations } }),
    Hostel.updateMany({ owner: user._id, deletedAt: null }, { $set: { deletedAt: new Date(), featured: false } }),
  ]);
  await user.deleteOne();
  res.status(204).end();
}
export async function feature(req, res) {
  const hostel = await Hostel.findOne({ _id: req.params.id, deletedAt: null });
  if (!hostel) throw new HttpError(404, 'Hostel not found');
  if (req.validated.body.featured && hostel.status !== 'APPROVED') throw new HttpError(409, 'Only approved listings can be featured');
  hostel.featured = req.validated.body.featured;
  await hostel.save();
  res.json({ data: hostel });
}
export async function analytics(req, res) {
  const [users, hostels, conversations, messages] = await Promise.all([
    User.aggregate([{ $group: { _id: '$role', count: { $sum: 1 } } }]),
    Hostel.aggregate([{ $match: { deletedAt: null } }, { $group: { _id: '$status', count: { $sum: 1 } } }]),
    Conversation.countDocuments(), Message.countDocuments(),
  ]);
  res.json({ data: { users, hostels, conversations, messages } });
}
