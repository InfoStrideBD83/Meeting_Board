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
   web service (root dir `server/`, `npm install` → `npm start`).
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

> Note the actual service URL Render gives you. The default is
> `https://infostride-meeting-board-api.onrender.com` — if yours differs, update
> the `destination` in `client/vercel.json` (step 2 below).

---

## 2. Frontend on Vercel

Config lives in [`client/vercel.json`](./client/vercel.json).

1. Confirm the `/api/*` rewrite `destination` in `client/vercel.json` matches your
   real Render URL from step 1.
2. Vercel dashboard → **Add New** → **Project** → import this repo.
3. Set **Root Directory** to `client`. No build command or framework is
   needed — it's a static site (leave build empty / "Other").
4. Deploy. Open the Vercel URL; it loads `Login.html` and all `/api` calls are
   transparently proxied to Render.
5. Make sure Render's `FRONTEND_URL` (step 1) matches this Vercel domain.

---

## Local development

Unchanged — the Render/Vercel config doesn't affect it:

```bash
cd server
cp .env.example .env   # fill in Supabase + JWT values
npm install
npm run dev
```

The server serves `client/` itself at <http://localhost:4000>, and `/api` hits
the backend directly (no proxy needed locally).
