create table if not exists public.police_rank_requests (
  id uuid primary key default gen_random_uuid(),
  discord_user_id text not null check (discord_user_id ~ '^[0-9]{17,20}$'),
  discord_username text not null,
  character_name text not null check (char_length(btrim(character_name)) between 1 and 100),
  plate text not null check (char_length(btrim(plate)) between 1 and 30),
  requested_rank_name text not null check (char_length(btrim(requested_rank_name)) between 1 and 100),
  approved_by_name text not null check (char_length(btrim(approved_by_name)) between 1 and 100),
  status text not null default 'pending' check (status in ('pending', 'accepted', 'rejected')),
  reviewed_by_discord_id text,
  reviewed_by_name text,
  review_reason text,
  discord_message_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  reviewed_at timestamptz
);

create index if not exists police_rank_requests_status_created_idx
  on public.police_rank_requests (status, created_at desc);

create index if not exists police_rank_requests_user_created_idx
  on public.police_rank_requests (discord_user_id, created_at desc);

alter table public.police_rank_requests enable row level security;
revoke all on public.police_rank_requests from anon, authenticated;
grant select, insert, update, delete on public.police_rank_requests to service_role;
