import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';
import { env } from '../config/env.js';
import { HttpError } from '../middleware/http.js';
import { PhoneCode } from '../models/index.js';
import { isLinked as isWhatsAppLinked, sendText as sendWhatsApp } from './whatsapp.js';

// Twilio Verify generates, sends, expires and checks the codes, so no OTP is stored here.
const twilio = {
  async request(path, form) {
    const response = await fetch(`https://verify.twilio.com/v2/Services/${env.TWILIO_VERIFY_SID}/${path}`, {
      method: 'POST', body: new URLSearchParams(form), signal: AbortSignal.timeout(10000),
      headers: { Authorization: `Basic ${Buffer.from(`${env.TWILIO_ACCOUNT_SID}:${env.TWILIO_AUTH_TOKEN}`).toString('base64')}` },
    });
    const body = await response.json().catch(() => ({}));
    // 404 on a check means the code expired or was already used.
    if (response.status === 404 && path === 'VerificationCheck') return { status: 'expired' };
    if (response.status === 429) throw new HttpError(429, 'Too many codes requested for this number. Please wait and try again.');
    if (response.status === 400) throw new HttpError(400, 'That phone number cannot receive SMS codes.');
    if (!response.ok) throw new HttpError(502, 'The SMS service is unavailable. Please try again later.');
    return body;
  },
  channel: 'sms',
  send: phone => twilio.request('Verifications', { To: phone, Channel: 'sms' }),
  async check(phone, code) { return (await twilio.request('VerificationCheck', { To: phone, Code: code })).status === 'approved'; },
};

// For channels without a verification service, codes are generated here and only an HMAC is stored.
const codeTtl = 10 * 60 * 1000, maxAttempts = 5;
const hashCode = (phone, code) => createHmac('sha256', env.JWT_SECRET).update(`${phone}:${code}`).digest('hex');
export function codeProvider(sendText, channel) {
  return {
    channel,
    async send(phone) {
      const code = randomInt(0, 1000000).toString().padStart(6, '0');
      await sendText(phone, `Your HostelHub verification code is ${code}. It expires in 10 minutes. Do not share it with anyone.`);
      await PhoneCode.updateOne({ _id: phone }, { $set: { codeHash: hashCode(phone, code), attempts: 0, expiresAt: new Date(Date.now() + codeTtl) } }, { upsert: true });
    },
    async check(phone, code) {
      const entry = await PhoneCode.findOneAndUpdate({ _id: phone, expiresAt: { $gt: new Date() }, attempts: { $lt: maxAttempts } }, { $inc: { attempts: 1 } }, { new: true });
      if (!entry) return false;
      const expected = Buffer.from(entry.codeHash, 'hex'), actual = Buffer.from(hashCode(phone, code), 'hex');
      if (!timingSafeEqual(expected, actual)) return false;
      await PhoneCode.deleteOne({ _id: phone });
      return true;
    },
  };
}
const whatsapp = codeProvider(sendWhatsApp, 'whatsapp');

let override = null;
const twilioConfigured = Boolean(env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN && env.TWILIO_VERIFY_SID);
const provider = () => override || (twilioConfigured ? twilio : isWhatsAppLinked() ? whatsapp : null);
export const smsEnabled = () => Boolean(provider());
export function setSmsProvider(next) { override = next; }
function requireProvider() {
  const current = provider();
  if (!current) throw new HttpError(503, 'Phone verification is not configured yet');
  return current;
}
export async function sendCode(phone) {
  const current = requireProvider();
  await current.send(phone);
  return current.channel || 'sms';
}
export const checkCode = (phone, code) => requireProvider().check(phone, code);

// Accepts Pakistani local numbers (0300 1234567) or full international numbers (+92 300 1234567).
export function normalizePhone(value) {
  const digits = value.replace(/[\s()-]/g, '');
  const phone = /^03\d{9}$/.test(digits) ? `+92${digits.slice(1)}` : digits.startsWith('00') ? `+${digits.slice(2)}` : digits;
  if (!/^\+[1-9]\d{7,14}$/.test(phone)) throw new HttpError(400, 'Enter a mobile number like 0300 1234567 or +92 300 1234567');
  return phone;
}
