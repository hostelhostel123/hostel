# HostelHub manual release guide

This is the work that must be completed in external dashboards or with production credentials. The application code and local automated tests are already complete.

Do the sections in order. Keep secrets in the relevant hosting dashboard; never commit a production `.env` file or put server secrets in a `VITE_*` variable.

## Release record

Fill these in as services are created. Use the final production origins, without a trailing slash.

```text
GitHub repository:      https://github.com/hostelSAAS/Hostel_Site
Admin origin:           https://hostel-site-admin.vercel.app
Owner/customer origin:  https://hostel-site-user.vercel.app
API origin:             https://hostel-site-u3kd.onrender.com
API URL used by Vite:   https://hostel-site-u3kd.onrender.com/api
Atlas cluster/database: ________________________________
Backend host:           ________________________________
Release date:           ________________________________
```

## 1. Confirm GitHub checks

1. Open the repository's **Actions** tab.
2. Confirm **Application checks** passes on both `main` and `master`.
3. Do not deploy a branch with a failed check.

Branch ownership:

- `main` contains the admin portal and is the source for the shared API deployment.
- `master` contains the owner/customer portal.
- Both portals must point to the same API and MongoDB database.

## 2. Reserve the two frontend projects

Import the same GitHub repository into two Vercel projects. This step establishes the exact frontend origins needed by API CORS configuration.

### Admin project

```text
Production branch: main
Root Directory:    client
Framework:         Vite
Build command:     npm run build
Output directory:  dist
```

### Owner project

```text
Production branch: master
Root Directory:    client
Framework:         Vite
Build command:     npm run build
Output directory:  dist
```

Record both assigned `https://...vercel.app` origins above. An initial build can fail until `VITE_API_URL` is configured; that is expected. Do not use preview-deployment URLs as production origins.

## 3. Create MongoDB Atlas resources

1. Create or select an Atlas project and cluster.
2. Create a dedicated database user for HostelHub. Generate a strong password and give it only the access the application needs.
3. Add the backend host's outbound IP address or documented outbound range under **Network Access**. Your laptop's IP does not give the hosted API access.
4. Obtain the driver connection string and include an explicit database name, for example:

   ```text
   mongodb+srv://HOSTELHUB_USER:PASSWORD@CLUSTER.mongodb.net/hostelhub?retryWrites=true&w=majority
   ```

5. URL-encode special characters in the username or password.
6. Save the completed value as `MONGODB_URI` on the backend host only.

Avoid `0.0.0.0/0` unless the selected host has no stable outbound range and you have consciously accepted that tradeoff. Atlas credentials must still be strong and unique.

## 4. Create Cloudinary credentials

1. Create or select a Cloudinary product environment.
2. Copy its cloud name, API key, and API secret.
3. Store these only on the backend host:

   ```text
   CLOUDINARY_CLOUD_NAME=...
   CLOUDINARY_API_KEY=...
   CLOUDINARY_API_SECRET=...
   ```

Never add the API secret to Vercel frontend variables. The application stores image references in MongoDB while Cloudinary stores the image files.

## 5. Deploy the shared API

Choose a Node hosting service that supports a persistent process and WebSockets. Use one API instance for this release; multiple replicas need shared Socket.IO, rate-limit, and session coordination that is not implemented yet.

Configure the service as follows:

```text
Repository:       hostelSAAS/Hostel_Site
Branch:           main
Root directory:   server
Node version:     22 or newer
Install command:  npm ci --omit=dev
Start command:    npm start
Health path:      /api/health
Instance count:   1
```

Set these runtime variables:

```env
NODE_ENV=production
MONGODB_URI=<Atlas connection string including the database name>
JWT_SECRET=<random value with at least 32 characters>
CLIENT_URL=<admin origin>,<owner/customer origin>
COOKIE_SAME_SITE=none
TRUST_PROXY=<documented proxy-hop count for the selected host>
CLOUDINARY_CLOUD_NAME=<Cloudinary cloud name>
CLOUDINARY_API_KEY=<Cloudinary API key>
CLOUDINARY_API_SECRET=<Cloudinary API secret>
```

The host normally supplies `PORT`; do not override it unless its documentation requires you to. `CLIENT_URL` must contain the two exact origins separated by a comma, with no paths or wildcard. Add an exact preview origin only when that preview genuinely needs API access.

Generate a JWT secret locally if needed:

```sh
node -e "console.log(require('node:crypto').randomBytes(48).toString('hex'))"
```

Cookie choice:

- Use `COOKIE_SAME_SITE=none` when the API and frontends are on unrelated hosted domains. HTTPS is mandatory.
- If all three use custom subdomains of the same site, such as `app.example.com`, `owner.example.com`, and `api.example.com`, prefer `COOKIE_SAME_SITE=lax`.
- Determine `TRUST_PROXY` from the backend host's documentation. Do not guess or enable unrestricted proxy trust.

`DNS_SERVERS` is optional. Leave it unset unless the host has documented DNS/SRV lookup problems; if needed, supply comma-separated DNS server IPs.

After deployment, record the public API origin and open:

```text
https://YOUR-API-HOST/api/health
```

It must return HTTP 200 and:

```json
{"data":{"status":"ok"}}
```

If it returns 503 or the service does not start, inspect host logs and recheck Atlas network access, `MONGODB_URI`, and required variables.

## 6. Configure and deploy both Vercel portals

Add these production build variables to **both** Vercel projects:

```env
VITE_API_URL=https://YOUR-API-HOST/api
VITE_SOCKET_URL=https://YOUR-API-HOST
```

`VITE_API_URL` must use public HTTPS and end in `/api`. `VITE_SOCKET_URL` is optional because it can be derived from the API URL, but setting it explicitly makes the production configuration clear. It must be the origin only, with no `/api` path.

On both projects also add the two portal addresses. They link the portals to each other and send an account that signs in on the wrong one (a student on the owner portal, an owner or admin on the student site) to the right one, already signed in:

```env
VITE_OWNER_PORTAL_URL=https://YOUR-OWNER-PORTAL
VITE_STUDENT_SITE_URL=https://YOUR-STUDENT-SITE
```

Then redeploy both projects. Vite embeds these values at build time, so changing a variable without rebuilding does not update the deployed application.

Directly open these routes after deployment:

```text
https://ADMIN-PORTAL/profile
https://ADMIN-PORTAL/admin
https://OWNER-PORTAL/dashboard
```

They should load the React application rather than return a Vercel 404.

## 7. Create the first administrator

Public registration cannot create an administrator. Use the backend host's shell or one-off command facility, temporarily supplying:

```env
ADMIN_NAME=<administrator display name>
ADMIN_EMAIL=<administrator email>
ADMIN_PASSWORD=<unique password, 12-72 bytes>
```

Run from the deployed `server` directory:

```sh
npm run create-admin
```

The command refuses to overwrite an existing email. After it reports success, immediately remove `ADMIN_PASSWORD` and the other temporary admin variables from the host configuration. Store the credentials in a password manager and test admin sign-in through the admin portal.

## 8. Run the read-only production smoke check

From a current local clone of the repository, substitute the three recorded URLs:

```sh
node scripts/check-deployment.mjs https://YOUR-API-HOST/api https://YOUR-ADMIN-PORTAL https://YOUR-OWNER-PORTAL
```

Every line must report `PASS`. This checks API/database health, credentialed CORS, direct SPA routes, and the API URL embedded in each frontend bundle. It does not write production data.

Typical failures:

- **API and database health:** inspect API logs, Atlas network access, and `MONGODB_URI`.
- **Credentialed CORS:** put the exact failing origin in backend `CLIENT_URL`, then restart the API.
- **SPA deep links:** confirm Vercel Root Directory is `client` and redeploy `client/vercel.json`.
- **Built API URL:** correct `VITE_API_URL` and rebuild that Vercel project.

## 9. Run the cross-portal GitHub workflow

1. Open **GitHub → Actions → Cross-portal browser verification**.
2. Select **Run workflow**.
3. Keep `main_ref=main` and `owner_ref=master`.
4. Confirm the workflow completes successfully.

This is an isolated automated check. It does not validate your real Atlas, Cloudinary, domains, or production cookies, so the next section is still required.

## 10. Complete the production acceptance test

Use new test accounts and a small real image. Check each item in the deployed sites.

### Owner flow

- [ ] Register an owner and sign out/sign back in.
- [ ] Create a hostel draft and reload to confirm persistence.
- [ ] Upload at least two genuine images to Cloudinary.
- [ ] Change the cover, reorder an image, and reload.
- [ ] Submit the listing for review and confirm `PENDING` remains after reload.

### Admin flow

- [ ] Sign in with the administrator account.
- [ ] Find the pending hostel and approve it with a blank optional note.
- [ ] Confirm analytics reflect real database records.
- [ ] Confirm a non-admin cannot open an admin route.

### Optional supported requester flow

The shared API retains the original `STUDENT` contract even though there is no separate third Vercel project.

- [ ] Register a student and find the approved hostel through search/filters.
- [ ] Save it to favorites and reload.
- [ ] Send the owner a message.
- [ ] Reply from the owner portal and confirm the student receives it in real time.
- [ ] Reload both message views and confirm history persists.

### Session and moderation checks

- [ ] Sign out and confirm protected pages redirect to sign-in.
- [ ] Suspend the test owner from the admin portal.
- [ ] Confirm the owner's active session is revoked and the listing disappears publicly.
- [ ] Test current Chrome/Safari or Firefox behavior; unrelated domains can trigger third-party-cookie restrictions.
- [ ] Check the main screens at a mobile width and on desktop.

Delete or clearly label test data after acceptance. Do not test suspension with the only real business owner account.

## 11. Final security and operations checklist

- [ ] No production secret exists in GitHub files, Vercel `VITE_*` variables, screenshots, or chat messages.
- [ ] Atlas uses a dedicated least-privilege database user and appropriate network rules.
- [ ] The API runs as one instance and its health check is enabled.
- [ ] Both portals use the same HTTPS API URL.
- [ ] `CLIENT_URL` contains only intended exact origins.
- [ ] Temporary `ADMIN_PASSWORD` variables were removed.
- [ ] Cloudinary upload and deletion work with production credentials.
- [ ] Backend and Atlas monitoring/alerts are enabled where available.
- [ ] A rollback target (the previous successful deployment) is identifiable in each hosting dashboard.
- [ ] Final URLs and the release date are recorded at the top of this document or in the team's private operations notes.

## Deferred features

Payments/subscriptions, reports, password reset, email verification, online presence, persistent moderation audit history, and safe multi-instance backend scaling are not part of this release. Do not advertise these as active until they are implemented and tested.

For architecture details and developer-oriented commands, see [DEPLOYMENT.md](DEPLOYMENT.md).
