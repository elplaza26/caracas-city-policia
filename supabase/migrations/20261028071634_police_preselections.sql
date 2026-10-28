create table if not exists public.police_preselections (
  discord_user_id text primary key check (discord_user_id ~ '^[0-9]{17,20}$'),
  discord_username text not null default '',
  full_name text not null default '',
  source_application_id uuid unique references public.police_applications(id) on delete set null,
  status text not null default 'active' check (status in ('active', 'converted', 'withdrawn')),
  accepted_at timestamptz not null default now(),
  converted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists police_preselections_status_accepted_idx
  on public.police_preselections (status, accepted_at desc);

create index if not exists police_preselections_name_idx
  on public.police_preselections (lower(full_name));

alter table public.police_preselections enable row level security;
revoke all on public.police_preselections from anon, authenticated;
grant select, insert, update, delete on public.police_preselections to service_role;

-- Move accepted applicants that were incorrectly stored as police staff placeholders.
insert into public.police_preselections (
  discord_user_id, discord_username, full_name, source_application_id,
  status, accepted_at, created_at, updated_at
)
select distinct on (a.discord_user_id)
  a.discord_user_id,
  coalesce(a.discord_username, ''),
  coalesce(a.full_name, ''),
  a.id,
  'active',
  coalesce(a.reviewed_at, a.created_at, now()),
  coalesce(a.created_at, now()),
  now()
from public.police_applications a
join public.police_personnel p on p.discord_user_id = a.discord_user_id
where a.status = 'accepted'
  and p.unit = 'UCOP'
  and btrim(coalesce(p.plate, '')) = ''
  and btrim(coalesce(p.rank_name, '')) = ''
  and p.rank_role_id is null
order by a.discord_user_id, a.created_at desc, a.id desc
on conflict (discord_user_id) do nothing;

delete from public.police_personnel p
using public.police_preselections s
where p.discord_user_id = s.discord_user_id
  and p.unit = 'UCOP'
  and btrim(coalesce(p.plate, '')) = ''
  and btrim(coalesce(p.rank_name, '')) = ''
  and p.rank_role_id is null;
