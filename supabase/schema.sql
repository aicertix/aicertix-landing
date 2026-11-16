-- AiCertix landing page: requests from the web form.
-- Run once in Supabase: Dashboard > SQL Editor > New query > paste > Run.

create table if not exists public.solicitudes (
  id              uuid primary key default gen_random_uuid(),
  created_at      timestamptz not null default now(),
  nombre          text not null,
  empresa         text,
  correo          text not null,
  pais_destino    text,
  puerto_origen   text,
  detalle         text not null,
  archivo_path    text,
  archivo_nombre  text,
  idioma          text not null default 'es',
  consentimiento  boolean not null default false,
  user_agent      text
);

-- Row level security on, with no policies: the public (anon) key cannot read or write this table.
-- Only the server function, which holds the secret key, can.
alter table public.solicitudes enable row level security;

-- Explicit Data API access: only the server role may use this table.
-- Needed on projects created with "Automatically expose new tables" turned off; harmless otherwise.
revoke all on table public.solicitudes from anon, authenticated;
grant select, insert on table public.solicitudes to service_role;

create index if not exists solicitudes_created_at_idx on public.solicitudes (created_at desc);

-- Private bucket for attached Excel/PDF files, 3 MB per file.
insert into storage.buckets (id, name, public, file_size_limit)
values ('solicitudes', 'solicitudes', false, 3145728)
on conflict (id) do nothing;
