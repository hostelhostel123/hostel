import { readdir, readFile } from 'node:fs/promises'
import { resolve, join } from 'node:path'
const [ownerPath, mainPath] = process.argv.slice(2)
if (!ownerPath || !mainPath) throw new Error('Usage: node scripts/check-shared.mjs <owner-worktree> <main-worktree>')
const owner = resolve(ownerPath), main = resolve(mainPath)
const ignored = new Set(['node_modules', 'test-results', 'playwright-report'])
async function files(directory, prefix = '') {
  const result = []
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (ignored.has(entry.name) || (entry.name.startsWith('.env') && entry.name !== '.env.example')) continue
    const relative = prefix + entry.name
    if (entry.isDirectory()) result.push(...await files(join(directory, entry.name), `${relative}/`))
    else if (entry.isFile()) result.push(relative)
  }
  return result
}
const paths = new Set([...(await files(join(owner, 'server'))).map(path => `server/${path}`), ...(await files(join(main, 'server'))).map(path => `server/${path}`),
  'client/src/services/api.js', 'client/src/services/config.js', 'client/src/context/AuthContext.jsx', 'client/src/components/ui.jsx', 'client/src/components/FloorPlan.jsx', 'client/src/components/theme.jsx', 'client/src/lib/rooms.js', 'client/src/pages/Account.jsx', 'client/src/pages/Messages.jsx', 'client/test/config.test.js', 'client/vite.config.js', 'client/vercel.json', 'client/.env.example',
])
let failures = 0
for (const path of paths) {
  try {
    const [left, right] = await Promise.all([readFile(join(owner, path), 'utf8'), readFile(join(main, path), 'utf8')])
    if (left.replaceAll('\r\n', '\n') !== right.replaceAll('\r\n', '\n')) throw new Error('contents differ')
  } catch (error) { failures++; console.error(`Shared file mismatch: ${path} (${error.code || error.message})`) }
}
if (failures) process.exitCode = 1
else console.log(`Shared backend and client modules match (${paths.size} files).`)
