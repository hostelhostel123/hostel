# Deploying the two HostelHub portals

For the ordered dashboard-by-dashboard checklist intended for the release owner, use [MANUAL_RELEASE_GUIDE.md](MANUAL_RELEASE_GUIDE.md).

The MERN architecture is unchanged: two React/Vite frontends call **one** Express API, which connects to **one** MongoDB database. MongoDB is not a browser-facing API. Backend files must stay identical on `main` and `master`.

## Deployment layout

| Service | Branch | Root directory | Install / build | Start / output |
| --- | --- | --- | --- | --- |
| Admin frontend | `main` | `client` | `npm ci`, `npm run build` | `dist` |
| Owner/customer frontend | `master` | `client` | `npm ci`, `npm run build` | `dist` |
| Shared API | `main` | `server` | `npm ci --omit=dev` | `npm start` |

Use Node 22 or newer. Deploy the API as one persistent Node service that supports WebSockets. A Docker alternative is included: build using `server` as the context (`docker build -t hostelhub-api ./server`). Configure runtime environment variables on the host; never bake a `.env` into the image. Scale to one instance until shared Socket.IO, rate-limit, and session coordination are implemented.

The repository does not create or modify hosting accounts, secrets, Atlas rules, or Vercel dashboard settings. These settings must be supplied before a working production release.

## 1. Configure the shared API

Set on the API host:

```env
NODE_ENV=production
MONGODB_URI=<MongoDB Atlas URI including the intended database>
JWT_SECRET=<a random secret of at least 32 characters>
CLIENT_URL=https://hostel-site.vercel.app,https://hostel-site-admin.vercel.app
COOKIE_SAME_SITE=none
TRUST_PROXY=<the actual number of trusted reverse-proxy hops>
CLOUDINARY_CLOUD_NAME=<your cloud name>
CLOUDINARY_API_KEY=<your API key>
CLOUDINARY_API_SECRET=<your API secret>
```

Use the actual frontend origins if domains change. Preview deployments require their own exact origins in `CLIENT_URL`; listing a production origin does not permit every preview. Do not allow arbitrary origins or remove the `X-Requested-With` guard.

The host may supply `PORT`; otherwise the API uses 5000. No build step is needed for the server. Set the host health-check path to `/api/health`. It must return HTTP 200 with `{"data":{"status":"ok"}}`. The server connects to MongoDB before listening; connection failures belong in the API startup logs.

In Atlas, allow the API host's outbound IP addresses, configure a database user, and select the same database for both portals. A developer laptop's IP allowance does not grant access to the hosted API. Never place `MONGODB_URI`, JWT secrets or Cloudinary secrets in `VITE_*` variables.

`COOKIE_SAME_SITE=none` is needed for unrelated frontend/API sites and requires HTTPS. Some browsers block third-party cookies even with this setting. Prefer custom domains such as `app.example.com`, `owner.example.com`, and `api.example.com` with `COOKIE_SAME_SITE=lax`. The client verifies that the session cookie works after login and reports failures instead of pretending the login succeeded.

Provision the first admin using `ADMIN_NAME`, `ADMIN_EMAIL`, `ADMIN_PASSWORD` and `npm run create-admin` on the API host; remove the password variable afterward. Public registration cannot create administrators. Demo seeding remains disabled in production.

## 2. Configure and rebuild both Vercel projects

Set each project's Root Directory to **client**. `client/vercel.json` selects Vite, builds `dist`, and rewrites browser routes to `index.html`. API and asset URLs are excluded from the SPA fallback so missing services are not hidden behind an HTML response.

Set these **build-time** variables in each project's applicable Production/Preview environment:

```env
VITE_API_URL=https://<public-api-host>/api
# Usually leave this unset; it is derived from VITE_API_URL.
VITE_SOCKET_URL=https://<public-api-host>
```

On both projects also set `VITE_OWNER_PORTAL_URL` (the owner and admin portal, built from `master`) and `VITE_STUDENT_SITE_URL` (the student site, built from `main`) to their production domains. Each portal hands accounts that belong on the other one across, already signed in.

Both projects must use the same API. Redeploy after changing variables: Vite embeds them into the JavaScript bundle. A production build deliberately fails when the API URL is missing, uses HTTP, points to localhost, contains credentials, or omits `/api`. This prevents the previous silent localhost deployment. Do not copy development `.env` values into production.

Only deploy the backend after synchronizing its changes to `main`. The shared authentication API now accepts either `{email,password}` or `{username,password}`, and both legacy `{name,email,password,role}` and owner profile registration fields. Existing email-only users can sign in with their email; no guessed username or destructive data migration is needed.

## 3. Verify the release

From either repository root, run the read-only smoke checker:

```sh
node scripts/check-deployment.mjs https://<public-api-host>/api https://hostel-site.vercel.app https://hostel-site-admin.vercel.app
```

It checks MongoDB-backed API health, credentialed CORS for each origin, a direct `/profile` URL, and the API URL embedded in each frontend's entry bundle. It does not create accounts or write to the database. Passing it does not replace the authenticated browser workflow checks below.

Verify owner registration, real Cloudinary upload, submission and replies; then verify admin approval, suspension and analytics. Reload pages to confirm persistence. Open `/dashboard` on the owner/customer site and `/admin` on the admin site directly. Check session expiry and both mobile and desktop layouts.

Local integration checks:

```sh
cd server
npm ci
npm test
npx playwright install chromium
npm run test:browser
```

Browser tests start an isolated temporary MongoDB, one API and both Vite frontends. They never use your `.env`, real MongoDB, or Cloudinary credentials. Only the Cloudinary storage boundary is stubbed; the upload request, file validation, database writes, auth, REST and sockets run normally. Live Cloudinary/Atlas/HTTPS-cookie validation is still required after hosting configuration.

The browser harness defaults to the owner checkout containing this file and the sibling `Hostel_Site_main` admin checkout. Set `OWNER_WORKTREE` and `MAIN_WORKTREE` to absolute checkout paths when using another layout (including running from `main`). Install `client` dependencies in both checkouts first.

Run `npm test` in each client for production-URL checks. For a production build check, supply the intended HTTPS API URL through `VITE_API_URL`. Placeholder test URLs validate compilation only and must never be used for a live release.

## Feature boundaries

The supported student, owner and admin screens use the shared API. Subscriptions/payments, reports, verification emails, password reset, presence and audit-history features remain deferred in `plan.md`; their pages do not show fabricated billing or activity data.
