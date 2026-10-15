import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import { z } from 'zod';
import { connectDatabase } from '../config/database.js';
import { User } from '../models/index.js';

const account = z.object({
  ADMIN_NAME: z.string().trim().min(1).max(100),
  ADMIN_USERNAME: z.string().trim().toLowerCase().regex(/^[a-z0-9_]{3,24}$/).optional(),
  ADMIN_EMAIL: z.email().transform(value => value.toLowerCase()),
  ADMIN_PASSWORD: z.string().min(12).max(72).refine(value => Buffer.byteLength(value) <= 72),
  ADMIN_ROLE: z.enum(['ADMIN', 'SUPERADMIN']).default('ADMIN'),
}).parse(process.env);
try {
  await connectDatabase();
  if (await User.exists({ email: account.ADMIN_EMAIL })) throw new Error('Email already exists; no account was changed');
  if (account.ADMIN_USERNAME && await User.exists({ username: account.ADMIN_USERNAME })) throw new Error('Username already exists; no account was changed');
  const [firstName, ...lastName] = account.ADMIN_NAME.split(/\s+/);
  await User.create({ name: account.ADMIN_NAME, firstName, lastName: lastName.join(' '), ...(account.ADMIN_USERNAME && { username: account.ADMIN_USERNAME }), email: account.ADMIN_EMAIL, password: await bcrypt.hash(account.ADMIN_PASSWORD, 12), role: account.ADMIN_ROLE });
  console.log(`${account.ADMIN_ROLE === 'SUPERADMIN' ? 'Super administrator' : 'Administrator'} created. Remove ADMIN_PASSWORD from the environment.`);
} finally { await mongoose.disconnect(); }
