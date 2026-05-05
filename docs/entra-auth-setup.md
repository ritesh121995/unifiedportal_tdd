# Portal authentication setup

This portal supports two authentication modes:

- `single_user` (recommended for current non-production rollout)
- `entra` (recommended for production)

Set mode with:

- Frontend build variable: `VITE_AUTH_MODE=single_user` or `VITE_AUTH_MODE=entra`
- Backend runtime variable: `AUTH_MODE=single_user` or `AUTH_MODE=entra`

---

## Option A: single-user login (quickest)

Use this now when you want only one credentialed user.

### Web App application settings (backend)

- `AUTH_MODE=single_user`
- `SIMPLE_AUTH_USERNAME=<login-username>` (example: `ritesh@mccain.com`)
- `SIMPLE_AUTH_PASSWORD=<strong-password>`
- `SIMPLE_AUTH_JWT_SECRET=<long-random-secret>`
- optional: `SIMPLE_AUTH_TOKEN_TTL_SECONDS=43200` (12h)

For the frontend build (GitHub workflow), set:

- `VITE_AUTH_MODE=single_user`

Behavior:

- User sees `/login` style screen in SPA.
- Login calls `POST /api/auth/login`.
- Backend returns JWT; frontend stores token and uses it for `/api/tdd/*`.

---

## Option B: Microsoft Entra ID sign-on

Use this when you move to production domain/governance.

### 1) Register applications in Entra ID

You can use one app registration for both frontend and backend API audience, but the cleanest setup is:

- **SPA app registration** (frontend login)
- **API app registration** (backend token audience)

### SPA registration

1. Azure Portal -> Microsoft Entra ID -> App registrations -> New registration
2. Name: `tdd-generator-spa`
3. Redirect URI type: **Single-page application (SPA)**
4. Redirect URI values:
   - `https://<your-webapp>.azurewebsites.net`
   - (optional local) `http://localhost:5173`

### API registration

1. Create another app registration named `tdd-generator-api`
2. Go to **Expose an API**
3. Set Application ID URI, for example:
   - `api://<API_CLIENT_ID>`
4. Add scope:
   - Scope name: `tdd.generate`
   - Admin consent display name: `Generate TDD documents`

### Grant permissions from SPA to API

1. Open SPA app -> API permissions -> Add a permission
2. My APIs -> select `tdd-generator-api`
3. Select delegated permission `tdd.generate`
4. Grant admin consent

### 2) Configure frontend environment variables

Set in Web App configuration (or CI build env if you build elsewhere):

- `VITE_ENTRA_CLIENT_ID=<SPA_APP_CLIENT_ID>`
- `VITE_ENTRA_TENANT_ID=<TENANT_ID_GUID>`
- `VITE_ENTRA_SCOPES=api://<API_CLIENT_ID>/tdd.generate`
- `VITE_ENTRA_REDIRECT_URI=https://<your-webapp>.azurewebsites.net`
- `VITE_ENTRA_POST_LOGOUT_REDIRECT_URI=https://<your-webapp>.azurewebsites.net`

### 3) Configure backend environment variables

Set in Azure Web App application settings:

- `AUTH_MODE=entra`
- `AUTH_TENANT_ID=<TENANT_ID_GUID>`
- `AUTH_ALLOWED_AUDIENCES=api://<API_APP_CLIENT_ID>,<API_APP_CLIENT_ID>`

Legacy fallback (still supported):

- `AUTH_CLIENT_ID=<API_APP_CLIENT_ID>`

Optional restrictions:

- `AUTH_ALLOWED_EMAIL_DOMAIN=mccain.com`
- `AUTH_ALLOWED_GROUP_IDS=<group-guid-1>,<group-guid-2>`

### 4) Behavior

- Browser redirects to Microsoft sign-in if no session exists.
- Access token is attached to API calls as `Authorization: Bearer <token>`.
- Backend verifies issuer + audience + signature using Entra JWKS.
- Unauthorized users receive `401` (or `403` for domain/group restriction failures).

### 5) Health endpoint

`GET /api/healthz` now returns auth config status:

- `auth.mode`
- `auth.required`
- `auth.configured`

Use this to confirm deployment configuration is correct.
