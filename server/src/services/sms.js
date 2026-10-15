import { env } from '../config/env.js';
import { HttpError } from '../middleware/http.js';

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
  send: phone => twilio.request('Verifications', { To: phone, Channel: 'sms' }),
  async check(phone, code) { return (await twilio.request('VerificationCheck', { To: phone, Code: code })).status === 'approved'; },
};

let provider = env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN && env.TWILIO_VERIFY_SID ? twilio : null;
export const smsEnabled = () => Boolean(provider);
export function setSmsProvider(next) { provider = next; }
function requireProvider() {
  if (!provider) throw new HttpError(503, 'Phone verification is not configured yet');
  return provider;
}
export const sendCode = phone => requireProvider().send(phone);
export const checkCode = (phone, code) => requireProvider().check(phone, code);

// Accepts Pakistani local numbers (0300 1234567) or full international numbers (+92 300 1234567).
export function normalizePhone(value) {
  const digits = value.replace(/[\s()-]/g, '');
  const phone = /^03\d{9}$/.test(digits) ? `+92${digits.slice(1)}` : digits.startsWith('00') ? `+${digits.slice(2)}` : digits;
  if (!/^\+[1-9]\d{7,14}$/.test(phone)) throw new HttpError(400, 'Enter a mobile number like 0300 1234567 or +92 300 1234567');
  return phone;
}
