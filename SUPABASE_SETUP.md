# Supabase Setup

## 1) Variables de entorno (`.env.local`)

```env
SUPABASE_URL=https://<tu-proyecto>.supabase.co
NEXT_PUBLIC_SUPABASE_URL=https://<tu-proyecto>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<service_role_key>
SUPABASE_SCHEMAS_TABLE=schemas
```

## 2) SQL para crear tabla

```sql
create table if not exists public.schemas (
  id text primary key,
  title text not null,
  summary text not null default '',
  mind_map jsonb not null,
  preview_url text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  full_schema jsonb null,
  metadata jsonb null
);

create index if not exists schemas_updated_at_idx on public.schemas (updated_at desc);
```

## 3) Notas

- La app usa rutas API Next.js:
  - `GET/POST /api/schemas`
  - `PUT/DELETE /api/schemas/:id`
- Si Supabase no está configurado o falla, la app hace fallback automático a `localStorage`.
- Se usa `SERVICE_ROLE_KEY` solo en backend (nunca en cliente).
