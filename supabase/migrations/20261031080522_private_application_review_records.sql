create table public.police_application_reviews (
 id uuid primary key, application_id uuid not null references public.police_applications(id) on delete cascade,
 verdict text not null check(verdict in ('reviewed','suspected_ai','declared_ai')),
 note text not null check(char_length(note) between 3 and 2000),
 reviewed_by_discord_id text not null check(reviewed_by_discord_id ~ '^[0-9]{17,20}$'),
 reviewed_by_name text not null, created_at timestamptz not null default now()
);
create index police_application_reviews_timeline on public.police_application_reviews(application_id,created_at desc,id desc);
alter table public.police_application_reviews enable row level security;
revoke all on public.police_application_reviews from public,anon,authenticated,service_role;
grant select,insert on public.police_application_reviews to service_role;
