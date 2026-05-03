# PostgreSQL Production Preparation

SQLite is enabled for local persistent storage. For production at larger scale, use PostgreSQL.

## Tables

```sql
CREATE TABLE users (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'viewer',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE entries (
  id BIGSERIAL PRIMARY KEY,
  date DATE NOT NULL,
  employee_name TEXT NOT NULL,
  role TEXT NOT NULL,
  testing_apps TEXT NOT NULL,
  support_tickets NUMERIC,
  chats_handled NUMERIC,
  bugs_added NUMERIC DEFAULT 0,
  quality_of_testing TEXT,
  app_reviews NUMERIC,
  system_process NUMERIC,
  issues_blockers TEXT DEFAULT '',
  notes TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

## Recommended Environment Variables

```text
DATABASE_URL=postgres://USER:PASSWORD@HOST:PORT/DATABASE
AUTH_SECRET=long-random-secret
ADMIN_EMAIL=admin@example.com
ADMIN_PASSWORD=strong-password
CORS_ORIGIN=https://your-frontend-domain.vercel.app
```

The current app uses SQLite locally. The next production hardening step is swapping the database helper functions in `server/index.js` to use `pg` with `DATABASE_URL`.
