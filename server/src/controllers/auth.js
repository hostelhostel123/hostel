import bcrypt from 'bcryptjs';
import { User, Session } from '../models/index.js';
import { createSession, publicUser } from '../services/auth.js';
import { cookieOptions } from '../config/env.js';
import { HttpError } from '../middleware/http.js';
import { checkCode, normalizePhone, sendCode } from '../services/sms.js';

export async function register(req, res) {
  const { password, firstName: suppliedFirst, lastName: suppliedLast, phone, username: suppliedUsername, email, role } = req.validated.body;
  const [firstName, ...lastParts] = (suppliedFirst ? `${suppliedFirst} ${suppliedLast}` : req.validated.body.name).trim().split(/\s+/);
  const lastName = suppliedLast || lastParts.join(' ');
  // Legacy email registrations do not reserve a guessed username (local parts collide).
  const user = await User.create({ firstName, lastName, name: `${firstName} ${lastName}`.trim(), phone, ...(suppliedUsername && { username: suppliedUsername }), email, role, password: await bcrypt.hash(password, 12) });
  await createSession(user, res);
  res.status(201).json({ data: publicUser(user) });
}
export async function usernameAvailable(req, res) {
  res.json({ data: { available: !(await User.exists({ username: req.validated.query.username })) } });
}
const dummyHash = bcrypt.hashSync('not-a-real-password', 12);
export async function login(req, res) {
  const { password } = req.validated.body;
  const loginName = req.validated.body.username || req.validated.body.email;
  const user = await User.findOne(loginName.includes('@') ? { email: loginName.toLowerCase() } : { username: loginName.toLowerCase() }).select('+password');
  const valid = await bcrypt.compare(password, user?.password || dummyHash);
  if (!valid || !user?.active) throw new HttpError(401, 'Invalid username or password');
  await createSession(user, res);
  res.json({ data: publicUser(user) });
}
export async function logout(req, res) {
  await Session.deleteOne({ _id: req.sessionId });
  req.app.get('io')?.in(`session:${req.sessionId}`).disconnectSockets(true);
  res.clearCookie('session', cookieOptions).status(204).end();
}
export async function profile(req, res) {
  req.user.name = req.validated.body.name;
  const [firstName, ...lastName] = req.user.name.split(/\s+/);
  req.user.firstName = firstName;
  req.user.lastName = lastName.join(' ');
  if (req.validated.body.phone !== undefined && req.validated.body.phone !== req.user.phone) {
    req.user.phone = req.validated.body.phone;
    req.user.phoneVerified = false;
  }
  await req.user.save();
  res.json({ data: publicUser(req.user) });
}
const resendAfter = 60000;
export async function sendPhoneCode(req, res) {
  const phone = normalizePhone(req.validated.body.phone);
  const user = await User.findById(req.user._id).select('+phoneCodeSentAt');
  const wait = user.phoneCodeSentAt && resendAfter - (Date.now() - user.phoneCodeSentAt.getTime());
  if (wait > 0) throw new HttpError(429, `Please wait ${Math.ceil(wait / 1000)} seconds before requesting another code`);
  const channel = await sendCode(phone);
  await User.updateOne({ _id: user._id }, { $set: { pendingPhone: phone, phoneCodeSentAt: new Date() } });
  res.json({ data: { phone, channel, resendAfterSeconds: resendAfter / 1000 } });
}
export async function verifyPhoneCode(req, res) {
  const user = await User.findById(req.user._id).select('+pendingPhone');
  if (!user.pendingPhone) throw new HttpError(409, 'Request a new code first');
  if (!await checkCode(user.pendingPhone, req.validated.body.code)) throw new HttpError(400, 'That code is incorrect or has expired');
  user.phone = user.pendingPhone;
  user.phoneVerified = true;
  user.pendingPhone = undefined;
  await user.save();
  res.json({ data: publicUser(user) });
}
