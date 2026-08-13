# Meeting Board — Backend API

Express + Supabase backend for the InfoStride Meeting Board. It exposes a REST API
over your existing Supabase tables and serves the static frontend from `../client`.

The server uses the Supabase **service role** key and applies its own JWT auth on
top, so the browser never talks to Supabase directly.

## Setup

```bash
cd server
npm install
npm run dev      # auto-restarts on change (Node --watch)
# or
npm start
```

Server: <http://localhost:4000> · Health: <http://localhost:4000/api/health>

### Environment (`server/.env`)

| Variable                    | Purpose                                                        |
| --------------------------- | ------------------------------------------------------------- |
| `PORT`                      | HTTP port (default 4000)                                       |
| `SUPABASE_URL`              | Your Supabase project URL                                      |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key — **server only, keep secret**               |
| `SUPABASE_ANON_KEY`         | Not used by this server (kept for reference)                   |
| `JWT_SECRET`                | Secret used to sign login tokens                               |
| `FRONTEND_URL`              | Comma-separated allowed CORS origins (empty = allow all, dev) |
| `NODE_ENV`                  | `development` hides nothing; `production` hides error stacks   |

`.env` is gitignored.

## Auth model

- `POST /api/auth/signup` — the **first ever** account becomes an approved admin
  and gets a token immediately. Every later signup is written to `pending_requests`
  and must be approved by an admin before login works.
- `POST /api/auth/login` — returns `{ member, token }`. Send the token as
  `Authorization: Bearer <token>` on all protected routes.
- Passwords are hashed with **bcrypt**. Legacy SHA-256 hashes from the old
  localStorage frontend are still accepted and transparently upgraded to bcrypt on
  the next successful login.

## Endpoints

All routes require `Authorization: Bearer <token>` unless marked _public_.
Admin-only routes are marked _(admin)_.

### Auth

| Method | Path               | Notes                                    |
| ------ | ------------------ | ---------------------------------------- |
| POST   | `/api/auth/signup` | _public_ — `{ name, email, password }`   |
| POST   | `/api/auth/login`  | _public_ — `{ email, password }`         |
| GET    | `/api/auth/me`     | Current member from token                |

### Members

| Method | Path               | Notes                                   |
| ------ | ------------------ | --------------------------------------- |
| GET    | `/api/members`     | List all                                |
| GET    | `/api/members/:id` | One                                     |
| POST   | `/api/members`     | _(admin)_ create                        |
| PATCH  | `/api/members/:id` | Admin edits anyone; a member edits self |
| DELETE | `/api/members/:id` | _(admin)_                               |

### Meetings

| Method | Path                | Notes                                                   |
| ------ | ------------------- | ------------------------------------------------------- |
| GET    | `/api/meetings`     | Filters: `?date=YYYY-MM-DD`, `?person_id=<uuid>`        |
| GET    | `/api/meetings/:id` | One                                                     |
| POST   | `/api/meetings`     | Create; `created_by` set from token                     |
| PATCH  | `/api/meetings/:id` | Admin or the meeting's owner (`person_id`)              |
| DELETE | `/api/meetings/:id` | Admin or owner                                          |

Unknown fields the frontend sends (its client-side `id` like `m_123`, and
`poc_country`, which has no column) are ignored — only real schema columns are written.

### Pending requests _(admin)_

| Method | Path                                | Notes                            |
| ------ | ----------------------------------- | -------------------------------- |
| GET    | `/api/pending-requests`             | List join requests               |
| POST   | `/api/pending-requests/:id/approve` | Move into members; `{ is_admin }`|
| POST   | `/api/pending-requests/:id/decline` | Delete the request               |

### Topics

| Method | Path             | Notes            |
| ------ | ---------------- | ---------------- |
| GET    | `/api/topics`    | List             |
| POST   | `/api/topics`    | _(admin)_ create |
| PATCH  | `/api/topics/:id`| _(admin)_ rename |
| DELETE | `/api/topics/:id`| _(admin)_        |

### Allotments (composite key `state` + `topic_id`)

| Method | Path               | Notes                                                    |
| ------ | ------------------ | -------------------------------------------------------- |
| GET    | `/api/allotments`  | Filter: `?topic_id=<uuid>`                               |
| PUT    | `/api/allotments`  | _(admin)_ upsert `{ state, topic_id, member_id\|null }`  |
| DELETE | `/api/allotments`  | _(admin)_ `{ state, topic_id }`                          |

### MIS entries (composite key `member_id` + `date`)

| Method | Path                | Notes                                                          |
| ------ | ------------------- | -------------------------------------------------------------- |
| GET    | `/api/mis-entries`  | Filters: `?member_id`, `?date`, `?from=&to=` (range)           |
| PUT    | `/api/mis-entries`  | Upsert `{ member_id, date, emails, calls, is_absent }`; self or admin |
| DELETE | `/api/mis-entries`  | `{ member_id, date }`; self or admin                           |

## Project structure

```
server/
├── .env                 # secrets (gitignored)
├── package.json
└── src/
    ├── index.js         # app entry: middleware, routes, static frontend
    ├── config/
    │   ├── env.js       # validated env config
    │   └── supabase.js  # service-role Supabase client
    ├── middleware/
    │   ├── auth.js      # JWT sign / requireAuth / requireAdmin
    │   └── errors.js    # 404 + central error handler
    ├── utils/
    │   ├── http.js      # asyncHandler, ApiError
    │   └── passwords.js # bcrypt + legacy SHA-256 verification
    └── routes/
        ├── auth.js
        ├── members.js
        ├── meetings.js
        ├── pendingRequests.js
        ├── topics.js
        ├── allotments.js
        └── misEntries.js
```

## Next step: wiring the frontend

The pages in `client/` still read and write browser `localStorage`
(`infostride-users`, `infostride-members`, `infostride-meetings`). To make them
use this API, replace those reads/writes with `fetch()` calls to the endpoints
above and store the login token (e.g. in `localStorage`) to send as the
`Authorization` header. That change is scoped to the frontend and can be done
page by page.
