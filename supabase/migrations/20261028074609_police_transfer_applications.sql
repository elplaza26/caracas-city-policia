create table if not exists public.police_transfer_applications (
  id uuid primary key default gen_random_uuid(),
  discord_user_id text not null,
  discord_username text not null default '',
  full_name text not null,
  age_ic integer,
  source_city text not null,
  source_faction text not null,
  current_rank text not null,
  current_unit text not null default '',
  requested_rank text not null default '',
  reason text not null,
  attempt_number integer not null default 1 check (attempt_number between 1 and 3),
  status text not null default 'pending' check (status in ('pending','accepted','rejected')),
  decision_reason text,
  reviewed_by_discord_id text,
  reviewed_by_name text,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  role_assigned_at timestamptz
);

create index if not exists police_transfer_applications_status_created_idx
  on public.police_transfer_applications (status, created_at desc);
create unique index if not exists police_transfer_applications_one_pending_per_user_idx
  on public.police_transfer_applications (discord_user_id) where status = 'pending';

alter table public.police_transfer_applications enable row level security;
revoke all on public.police_transfer_applications from anon, authenticated;
grant all on public.police_transfer_applications to service_role;
