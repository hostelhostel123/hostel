import { createServer } from 'node:http';
import mongoose from 'mongoose';
import { createApp } from './app.js';
import { connectDatabase } from './config/database.js';
import { env } from './config/env.js';
import { attachSockets } from './sockets/index.js';
import { startIfLinked as startWhatsAppIfLinked } from './services/whatsapp.js';

const app = createApp({ ensureDatabase: connectDatabase });

if (!process.env.VERCEL) {
  await connectDatabase();
  const server = createServer(app);
  const io = attachSockets(server);
  app.set('io', io);
  server.listen(env.PORT, () => console.log(`HostelHub API listening on port ${env.PORT}`));
  startWhatsAppIfLinked().catch(error => console.error('WhatsApp reconnect failed:', error.message));
  let closing = false;
  async function shutdown() {
    if (closing) return;
    closing = true;
    const timeout = setTimeout(() => process.exit(1), 10000);
    timeout.unref();
    io.close();
    server.close(async () => { await mongoose.disconnect(); clearTimeout(timeout); process.exit(0); });
  }
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

export default app;
