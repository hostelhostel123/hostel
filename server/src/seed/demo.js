import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import { connectDatabase } from '../config/database.js';
import { env } from '../config/env.js';
import { User, Hostel, Conversation, Message } from '../models/index.js';

const room = (floor, code, seats, available, price, x, y, w, h) => ({ floor, code, seats, available, price, x, y, w, h });
const area = (floor, label, kind, x, y, w, h) => ({ floor, label, kind, x, y, w, h });
// A two-floor layout in plan units: rooms along both sides of a central corridor.
const demoPlan = {
  rooms: [
    room(0, '101', 1, 1, 34000, 0, 0, 18, 22), room(0, '102', 2, 1, 28500, 18, 0, 20, 22), room(0, '103', 2, 0, 28500, 38, 0, 20, 22),
    room(0, '104', 3, 2, 24000, 40, 32, 20, 22), room(0, '105', 3, 3, 24000, 60, 32, 20, 22), room(0, '106', 4, 1, 21000, 80, 32, 20, 22),
    room(1, '201', 1, 0, 34000, 0, 0, 18, 22), room(1, '202', 2, 2, 28500, 18, 0, 20, 22), room(1, '203', 2, 1, 28500, 38, 0, 20, 22), room(1, '204', 2, 2, 29500, 70, 0, 30, 22),
    room(1, '205', 3, 1, 24000, 40, 32, 20, 22), room(1, '206', 3, 0, 24000, 60, 32, 20, 22), room(1, '207', 4, 4, 21000, 80, 32, 20, 22),
  ],
  areas: [
    area(0, 'Corridor', 'CORRIDOR', 0, 22, 100, 10), area(0, 'Washroom', 'BATH', 58, 0, 12, 22), area(0, 'Kitchen', 'KITCHEN', 70, 0, 30, 22),
    area(0, 'Common room', 'COMMON', 0, 32, 30, 22), area(0, 'Stairs', 'STAIRS', 30, 32, 10, 22),
    area(1, 'Corridor', 'CORRIDOR', 0, 22, 100, 10), area(1, 'Washroom', 'BATH', 58, 0, 12, 22),
    area(1, 'Study', 'STUDY', 0, 32, 30, 22), area(1, 'Stairs', 'STAIRS', 30, 32, 10, 22),
  ],
};

if (env.NODE_ENV === 'production') throw new Error('Demo seeding is disabled in production');
const password = process.env.SEED_PASSWORD || 'Password123!';
if (password.length < 10 || Buffer.byteLength(password) > 72) throw new Error('SEED_PASSWORD must be 10-72 bytes');
try {
  await connectDatabase();
  const accounts = {};
  for (const role of ['STUDENT', 'OWNER', 'ADMIN']) {
    const email = `${role.toLowerCase()}@example.com`;
    accounts[role] = await User.findOneAndUpdate(
      { email },
      { $setOnInsert: { name: `Demo ${role.toLowerCase()}`, email, role, password: await bcrypt.hash(password, 12) }, $set: { username: role.toLowerCase() } },
      { upsert: true, new: true, runValidators: true },
    );
  }
  const owner = accounts.OWNER._id;
  let hostel = await Hostel.findOne({ owner, name: 'Demo Olive House' });
  hostel ||= await Hostel.create({ owner, name: 'Demo Olive House', description: 'A quiet student residence near campus.', city: 'Lahore', address: 'Gulberg III', price: 28500, beds: 12, amenities: ['WiFi', 'Laundry'], status: 'APPROVED' });
  if (!hostel.rooms?.length) { hostel.set(demoPlan); await hostel.save(); }
  if (!await Hostel.exists({ owner, name: 'Demo Campus House' })) await Hostel.create({ owner, name: 'Demo Campus House', description: 'A listing waiting for review.', city: 'Lahore', address: 'Johar Town', price: 22000, beds: 6, status: 'PENDING' });
  await User.updateOne({ _id: accounts.STUDENT._id }, { $addToSet: { favorites: hostel._id } });
  const conversation = await Conversation.findOneAndUpdate({ hostel: hostel._id, student: accounts.STUDENT._id }, { $setOnInsert: { owner } }, { upsert: true, new: true });
  if (!await Message.exists({ conversation: conversation._id })) await Message.create({ conversation: conversation._id, sender: accounts.STUDENT._id, recipient: owner, text: 'Is a room available for a visit this week?' });
  console.log(`Demo accounts: student, owner, admin. Password: ${process.env.SEED_PASSWORD ? 'SEED_PASSWORD' : 'Password123!'}; existing passwords are unchanged.`);
} finally { await mongoose.disconnect(); }
