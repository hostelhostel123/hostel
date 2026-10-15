// Isolated browser-test harness. Never loads application .env or a real database.
import { MongoMemoryServer } from 'mongodb-memory-server'
import mongoose from 'mongoose'
import bcrypt from 'bcryptjs'
import { createServer } from 'node:http'
import { Writable } from 'node:stream'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import { v2 as cloudinary } from 'cloudinary'
import express from 'express'

const root = fileURLToPath(new URL('../../', import.meta.url))
const ownerRoot = process.env.OWNER_WORKTREE || root
const mainRoot = process.env.MAIN_WORKTREE || resolve(root, '../Hostel_Site_main')
const children = []
const mongo = await MongoMemoryServer.create()
Object.assign(process.env, { DOTENV_CONFIG_PATH: '__no_test_env_file__', NODE_ENV: 'test', PORT: '5100', MONGODB_URI: mongo.getUri(), JWT_SECRET: 'isolated-browser-test-secret-not-for-production', CLIENT_URL: 'http://localhost:5173,http://localhost:5174', COOKIE_SAME_SITE: 'lax', TRUST_PROXY: '0', CLOUDINARY_CLOUD_NAME: 'browser-test', CLOUDINARY_API_KEY: 'browser-test', CLOUDINARY_API_SECRET: 'browser-test' })
// Exercise multipart parsing and magic-byte validation; stub only the external storage boundary.
let imageId = 0
cloudinary.uploader.upload_stream = (_options, callback) => new Writable({ write(_chunk, _encoding, done) { done() }, final(done) { callback(null, { public_id: `browser-test/${++imageId}`, secure_url: 'http://localhost:5100/test-photo.png' }); done() } })
cloudinary.uploader.destroy = async () => ({ result: 'ok' })
const { connectDatabase } = await import('../src/config/database.js')
await connectDatabase()
const { User } = await import('../src/models/index.js')
await Promise.all(Object.values(mongoose.models).map(model => model.init()))
await User.create({ name: 'Browser Administrator', email: 'admin@browser.example', role: 'ADMIN', password: await bcrypt.hash('Browser-testing-123!', 12) })
const { createApp } = await import('../src/app.js')
const { attachSockets } = await import('../src/sockets/index.js')
const app = createApp()
const testApp = express()
// Static fixture is a valid 1px PNG; no external image service is contacted.
testApp.get('/test-photo.png', (_req, res) => res.type('png').send(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aO2sAAAAASUVORK5CYII=', 'base64')))
testApp.use(app)
const server = createServer(testApp)
const io = attachSockets(server)
app.set('io', io)
for (const [directory, port] of [[mainRoot, 5173], [ownerRoot, 5174]]) {
  children.push(spawn(process.execPath, [resolve(directory, 'client/node_modules/vite/bin/vite.js'), '--host', 'localhost', '--port', String(port), '--strictPort'], {
    cwd: resolve(directory, 'client'), stdio: 'inherit', windowsHide: true,
    env: { ...process.env, NODE_ENV: 'development', VITE_API_URL: 'http://localhost:5100/api', VITE_SOCKET_URL: 'http://localhost:5100', VITE_OWNER_PORTAL_URL: 'http://localhost:5174', VITE_STUDENT_SITE_URL: 'http://localhost:5173' },
  }))
}
// Advertise ready only after both frontends answer.
for (const port of [5173, 5174]) {
  let ready = false
  for (let attempt = 0; attempt < 100; attempt++) {
    if (children.some(child => child.exitCode !== null)) throw new Error('A frontend test server exited early')
    try { ready = (await fetch(`http://localhost:${port}`, { signal: AbortSignal.timeout(1000) })).ok } catch {}
    if (ready) break
    await new Promise(done => setTimeout(done, 200))
  }
  if (!ready) throw new Error(`Frontend ${port} did not become ready`)
}
server.listen(5100, 'localhost')
let closing = false
async function shutdown() {
  if (closing) return
  closing = true
  children.forEach(child => child.kill())
  io.close(); server.close()
  await mongoose.disconnect(); await mongo.stop(); process.exit(0)
}
process.on('SIGTERM', shutdown)
process.on('SIGINT', shutdown)
