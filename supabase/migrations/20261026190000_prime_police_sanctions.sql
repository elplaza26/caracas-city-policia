create table if not exists public.police_sanctions (
  id uuid primary key default gen_random_uuid(),
  discord_user_id text not null,
  discord_username text not null default '',
  target_name text not null default '',
  plate text not null default '',
  action_type text not null check (action_type in ('warning', 'strike')),
  level integer not null check (level >= 1),
  reason text not null,
  issuer_discord_id text not null,
  issuer_name text not null default '',
  status text not null default 'pending' check (status in ('pending', 'active', 'failed')),
  active boolean not null default false,
  discord_message_id text,
  notification_error text,
  failure_reason text,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);
create index if not exists police_sanctions_target_created_idx on public.police_sanctions (discord_user_id, created_at desc);
create index if not exists police_sanctions_active_type_idx on public.police_sanctions (discord_user_id, action_type, level) where active;
alter table public.police_sanctions enable row level security;
revoke all on public.police_sanctions from anon, authenticated;
grant select, insert, update, delete on public.police_sanctions to service_role;

create unique index if not exists police_sanctions_one_level_idx
  on public.police_sanctions (discord_user_id, action_type, level)
  where status in ('pending', 'active');