import 'dotenv/config';
import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(5000),
  MONGODB_URI: z.string().min(1),
  JWT_SECRET: z.string().min(32),
  CLIENT_URL: z.string().min(1),
  COOKIE_SAME_SITE: z.enum(['lax', 'strict', 'none']).default('lax'),
  TRUST_PROXY: z.coerce.number().int().min(0).default(0),
  DNS_SERVERS: z.string().optional(),
  TWILIO_ACCOUNT_SID: z.string().trim().optional(),
  TWILIO_AUTH_TOKEN: z.string().trim().optional(),
  TWILIO_VERIFY_SID: z.string().trim().optional(),
});
export const env = schema.parse(process.env);
export const origins = env.CLIENT_URL.split(',').map(value => new URL(value.trim()).origin);
export const cookieOptions = {
  httpOnly: true, secure: env.NODE_ENV === 'production' || env.COOKIE_SAME_SITE === 'none',
  sameSite: env.COOKIE_SAME_SITE, path: '/',
};
