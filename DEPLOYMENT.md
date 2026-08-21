# Deployment

Frontend (`client/`) → **Vercel** (static). Backend (`server/`) → **Render** (Node web service).
The Supabase database is shared by both.

The frontend always calls a same-origin `/api`. In production `client/vercel.json`
rewrites `/api/*` to the Render backend, so there are **no CORS issues and no
per-environment code changes** — just deploy.

---

## 1. Backend on Render

Config lives in [`render.yaml`](./render.yaml) (a Render Blueprint).

1. Push this repo to GitHub.
2. Render dashboard → **New +** → **Blueprint** → select this repo.
   Render reads `render.yaml` and creates the `infostride-meeting-board-api`
   web service (root dir `server/`). The build command installs the server's
   own deps, then builds the React client (`client/dist`) too, since
   `server/src/index.js` serves that build as a fallback — this matters even
   if Vercel is your primary frontend host, since Render's own URL should
   still work standalone (e.g. for the health check, or if Vercel isn't set
   up yet).
3. In the service's **Environment** tab, fill in the secrets marked `sync: false`:

   | Variable                    | Value                                                       |
   | --------------------------- | ----------------------------------------------------------- |
   | `SUPABASE_URL`              | `https://<your-project>.supabase.co`                        |
   | `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Settings → API → **service_role** key (secret)   |
   | `FRONTEND_URL`              | Your Vercel URL, e.g. `https://<your-app>.vercel.app`       |

   `NODE_ENV=production`, `PORT`, and a random `JWT_SECRET` are set automatically
   by the blueprint.
4. Deploy. Verify: `https://<your-service>.onrender.com/api/health` returns
   `{ "status": "ok", ... }`.

> Note the actual service URL Render gives you (currently
> `https://meeting-board.onrender.com`). If it ever changes, update the
> `destination` in `client/vercel.json` (step 2 below).

---

## 2. Frontend on Vercel

Config lives in [`client/vercel.json`](./client/vercel.json).

The client is a Vite + React SPA (see `client/src/`); `client/vercel.json` sets
the build command (`npm run build`) and output directory (`dist`) for you.

1. Confirm the `/api/*` rewrite `destination` in `client/vercel.json` matches your
   real Render URL from step 1.
2. Vercel dashboard → **Add New** → **Project** → import this repo.
3. Set **Root Directory** to `client`. Framework preset "Vite" (or "Other" —
   `vercel.json`'s `buildCommand`/`outputDirectory` cover it either way).
4. Deploy. Open the Vercel URL; the React Router SPA loads, redirects to
   `/login` if you're not signed in, and all `/api` calls are transparently
   proxied to Render.
5. Make sure Render's `FRONTEND_URL` (step 1) matches this Vercel domain.

---

## Local development

Backend:

```bash
cd server
cp .env.example .env   # fill in Supabase + JWT values
npm install
npm run dev
```

Frontend — two ways to run it, pick one:

- **Fast iteration (recommended):** Vite's dev server with hot reload, proxying
  `/api` to the Express server above (see `client/vite.config.js`):
  ```bash
  cd client
  npm install
  npm run dev            # http://localhost:5173, requires the backend running too
  ```
- **Production-like:** build once and let Express serve the static bundle
  directly (matches what happens in production on Render/Vercel):
  ```bash
  cd client
  npm install
  npm run build           # writes client/dist
  ```
  Then open the backend's own URL (e.g. <http://localhost:4000>) — it serves
  `client/dist` with an SPA fallback, so every route (including a hard refresh
  on `/meetings`) resolves correctly.
