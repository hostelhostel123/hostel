import { randomUUID } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { env, cookieOptions } from '../config/env.js';
import { Session, User } from '../models/index.js';
import { HttpError } from '../middleware/http.js';
import { smsEnabled } from './sms.js';

export const phoneVerificationRequired = user => user.role === 'OWNER' && smsEnabled() && !user.phoneVerified;
export const publicUser = user => ({ id: user.id, name: user.name, firstName: user.firstName, lastName: user.lastName, phone: user.phone, phoneVerified: Boolean(user.phoneVerified), phoneVerificationRequired: phoneVerificationRequired(user), username: user.username, email: user.email, role: user.role, active: user.active, ...(user.role === 'STUDENT' && { favoriteIds: user.favorites.map(String) }) });
export async function createSession(user, res) {
  const sessionId = randomUUID();
  await Session.create({ _id: sessionId, user: user._id, expiresAt: new Date(Date.now() + 86400000) });
  const token = jwt.sign({}, env.JWT_SECRET, { subject: user.id, jwtid: sessionId, expiresIn: '1d', issuer: 'hostelhub', audience: 'hostelhub-web', algorithm: 'HS256' });
  res.cookie('session', token, { ...cookieOptions, maxAge: 86400000 });
}
export async function verifySession(token) {
  try {
    const payload = jwt.verify(token, env.JWT_SECRET, { algorithms: ['HS256'], issuer: 'hostelhub', audience: 'hostelhub-web' });
    // Both lookups run together: the database is a long round trip away from the API server.
    const [session, user] = await Promise.all([Session.exists({ _id: payload.jti, user: payload.sub, expiresAt: { $gt: new Date() } }), User.findById(payload.sub)]);
    if (!session || !user?.active) throw new Error('Inactive session');
    return { user, sessionId: payload.jti };
  } catch (error) {
    if (error.name?.startsWith('Mongo')) throw error;
    throw new HttpError(401, 'Please sign in');
  }
}
