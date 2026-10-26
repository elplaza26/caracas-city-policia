
create extension if not exists pgcrypto;

create table if not exists public.police_applications (
  id uuid primary key default gen_random_uuid(),
  discord_user_id text not null,
  discord_username text not null default '',
  full_name text not null,
  age integer,
  previous_experience text not null default '',
  motivation text not null default '',
  availability text not null default '',
  status text not null default 'pending' check (status in ('pending','accepted','rejected')),
  decision_reason text not null default '',
  reviewed_by_discord_id text,
  reviewed_by_name text,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  role_assigned_at timestamptz,
  discord_guild_id text not null default '1539970134469378068'
);

create index if not exists police_applications_status_created_idx
  on public.police_applications (status, created_at desc);
create index if not exists police_applications_discord_user_idx
  on public.police_applications (discord_user_id, created_at desc);

alter table public.police_applications enable row level security;

revoke all on public.police_applications from anon, authenticated;
grant select, insert, update on public.police_applications to service_role;

comment on table public.police_applications is
  'Caracas City Policía recruitment pre-applications. Access only through trusted server-side functions; no public client access.';
;
