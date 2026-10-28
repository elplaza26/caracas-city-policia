create table public.police_duty_shifts (
 id uuid primary key default gen_random_uuid(),
 discord_user_id text not null check (discord_user_id ~ '^[0-9]{17,20}$'),
 full_name text not null,
 plate text not null default '',
 unit text not null check (unit in ('UCOP','CIC')),
 started_at timestamptz not null default now(),
 ended_at timestamptz,
 closed_by text,
 close_reason text,
 check (ended_at is null or ended_at >= started_at)
);
create unique index police_one_open_shift on public.police_duty_shifts(discord_user_id) where ended_at is null;
create index police_shifts_started on public.police_duty_shifts(started_at desc);
alter table public.police_duty_shifts enable row level security;
revoke all on public.police_duty_shifts from anon, authenticated;
grant select, insert, update on public.police_duty_shifts to service_role;
