create table if not exists public.police_personnel (
  discord_user_id text primary key check (discord_user_id ~ '^[0-9]{17,20}$'),
  discord_username text not null default '',
  full_name text not null default '',
  plate text not null default '',
  rank_name text not null default '',
  rank_role_id text,
  status text not null default 'active' check (status in ('active', 'inactive')),
  source_application_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_rank_change_at timestamptz
);

create index if not exists police_personnel_name_idx on public.police_personnel (lower(full_name));
create index if not exists police_personnel_rank_role_idx on public.police_personnel (rank_role_id) where rank_role_id is not null;

create table if not exists public.police_rank_roles (
  role_id text primary key check (role_id ~ '^[0-9]{17,20}$'),
  role_name text not null,
  rank_order integer not null unique check (rank_order > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.police_rank_history (
  id uuid primary key default gen_random_uuid(),
  discord_user_id text not null check (discord_user_id ~ '^[0-9]{17,20}$'),
  discord_username text not null default '',
  full_name text not null default '',
  action_type text not null check (action_type in ('promotion', 'demotion', 'assignment')),
  previous_role_id text,
  previous_rank_name text not null default '',
  new_role_id text not null,
  new_rank_name text not null,
  reason text not null,
  changed_by_discord_id text not null,
  changed_by_name text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists police_rank_history_target_created_idx on public.police_rank_history (discord_user_id, created_at desc);

alter table public.police_personnel enable row level security;
alter table public.police_rank_roles enable row level security;
alter table public.police_rank_history enable row level security;
revoke all on public.police_personnel, public.police_rank_roles, public.police_rank_history from anon, authenticated;
grant select, insert, update, delete on public.police_personnel, public.police_rank_roles, public.police_rank_history to service_role;

insert into public.police_personnel (discord_user_id, discord_username, full_name, source_application_id, status)
select distinct on (discord_user_id)
  discord_user_id, coalesce(discord_username, ''), coalesce(full_name, ''), id, 'active'
from public.police_applications
where status = 'accepted' and discord_user_id ~ '^[0-9]{17,20}$'
order by discord_user_id, created_at desc
on conflict (discord_user_id) do nothing;