alter table public.police_rank_roles
  add column if not exists minimum_days integer not null default 0
  check (minimum_days >= 0 and minimum_days <= 3650);
