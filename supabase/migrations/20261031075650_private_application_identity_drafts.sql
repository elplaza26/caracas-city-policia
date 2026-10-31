create table public.police_application_drafts (
 id uuid primary key, discord_user_id text not null unique,
 payload jsonb not null, created_at timestamptz not null default now(),
 expires_at timestamptz not null, consumed_at timestamptz,
 check (discord_user_id ~ '^[0-9]{17,20}$')
);
alter table public.police_application_drafts enable row level security;
revoke all on public.police_application_drafts from public,anon,authenticated;
grant select,insert,update,delete on public.police_application_drafts to service_role;
