import mongoose from 'mongoose';
import pino from 'pino';
import QRCode from 'qrcode';
import { HttpError } from '../middleware/http.js';

// Unofficial WhatsApp Web connection (Baileys) for sending OTP codes from a linked number.
// The login keys live in MongoDB so the link survives restarts and redeploys.
const logger = pino({ level: 'silent' });
const collection = () => mongoose.connection.db.collection('whatsapp_auth');
const status = { state: 'disconnected', qr: null, number: null, error: null };
let socket = null;
let linked = false;
let starting = null;
let stopping = false;

async function mongoAuthState(baileys) {
  const { BufferJSON, initAuthCreds, proto } = baileys;
  const read = async id => {
    const doc = await collection().findOne({ _id: id });
    return doc ? JSON.parse(doc.value, BufferJSON.reviver) : null;
  };
  const write = (id, value) => collection().updateOne({ _id: id }, { $set: { value: JSON.stringify(value, BufferJSON.replacer) } }, { upsert: true });
  const creds = await read('creds') || initAuthCreds();
  return {
    state: {
      creds,
      keys: {
        async get(type, ids) {
          const data = {};
          await Promise.all(ids.map(async id => {
            const value = await read(`${type}-${id}`);
            data[id] = type === 'app-state-sync-key' && value ? proto.Message.AppStateSyncKeyData.fromObject(value) : value;
          }));
          return data;
        },
        async set(data) {
          await Promise.all(Object.entries(data).flatMap(([type, values]) => Object.entries(values).map(([id, value]) => value ? write(`${type}-${id}`, value) : collection().deleteOne({ _id: `${type}-${id}` }))));
        },
      },
    },
    saveCreds: () => write('creds', creds),
  };
}

async function connect() {
  const baileys = await import('@whiskeysockets/baileys');
  const { default: makeWASocket, DisconnectReason, Browsers, fetchLatestBaileysVersion } = baileys;
  const { state, saveCreds } = await mongoAuthState(baileys);
  const version = await fetchLatestBaileysVersion().then(result => result.version).catch(() => undefined);
  status.state = 'connecting'; status.error = null;
  const sock = makeWASocket({ ...(version && { version }), auth: state, logger, browser: Browsers.ubuntu('HostelHub'), markOnlineOnConnect: false, syncFullHistory: false });
  socket = sock;
  sock.ev.on('creds.update', saveCreds);
  sock.ev.on('connection.update', async ({ connection, lastDisconnect, qr }) => {
    if (sock !== socket) return;
    if (qr) { status.state = 'qr'; status.qr = await QRCode.toDataURL(qr, { margin: 1, width: 280 }); }
    if (connection === 'open') {
      linked = true;
      Object.assign(status, { state: 'connected', qr: null, error: null, number: state.creds.me?.id?.split(/[:@]/)[0] || null });
    }
    if (connection === 'close') {
      socket = null; status.qr = null;
      const code = lastDisconnect?.error?.output?.statusCode;
      if (code === DisconnectReason.loggedOut) {
        await collection().deleteMany({});
        linked = false;
        Object.assign(status, { state: 'disconnected', number: null, error: 'WhatsApp logged this device out. Link the number again.' });
      } else if (!stopping && (state.creds.me || code === DisconnectReason.restartRequired)) {
        status.state = 'connecting';
        setTimeout(() => start().catch(() => {}), 2000);
      } else {
        Object.assign(status, { state: 'disconnected', error: stopping ? null : 'The QR code expired. Start linking again.' });
      }
    }
  });
}

export function start() {
  stopping = false;
  if (socket) return Promise.resolve();
  starting ??= connect().catch(error => { status.state = 'disconnected'; status.error = 'Could not reach WhatsApp. Try again.'; throw error; }).finally(() => { starting = null; });
  return starting;
}
export async function startIfLinked() {
  const creds = await collection().findOne({ _id: 'creds' });
  linked = Boolean(creds && JSON.parse(creds.value).me);
  if (linked) await start();
}
export const isLinked = () => linked;
export const getStatus = () => ({ ...status, linked });
export async function unlink() {
  stopping = true;
  const sock = socket;
  socket = null;
  await sock?.logout().catch(() => {});
  sock?.end(undefined);
  await collection().deleteMany({});
  linked = false;
  Object.assign(status, { state: 'disconnected', qr: null, number: null, error: null });
}
async function ready() {
  if (status.state === 'connected' && socket) return socket;
  if (!linked) throw new HttpError(503, 'WhatsApp verification is not set up yet');
  await start();
  for (let waited = 0; waited < 25000; waited += 500) {
    if (status.state === 'connected' && socket) return socket;
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  throw new HttpError(503, 'WhatsApp is reconnecting. Please try again in a minute.');
}
export async function sendText(phone, text) {
  const sock = await ready();
  const [contact] = await sock.onWhatsApp(`${phone.replace('+', '')}@s.whatsapp.net`);
  if (!contact?.exists) throw new HttpError(400, 'That number is not on WhatsApp');
  await sock.sendMessage(contact.jid, { text });
}
